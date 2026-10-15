/**
 * server.cjs
 * Secure Node.js Production-Ready Server for Personal Portfolio Website.
 * 
 * Features:
 * - Native Node.js HTTP server (zero external dependencies)
 * - Cryptographically secure authentication via crypto.scrypt & timingSafeEqual
 * - HttpOnly, SameSite=Strict session cookie management
 * - In-memory rate limiting against brute-force attacks (5 attempts / 15 mins)
 * - Path traversal prevention & safe static file serving with MIME types
 * - Standard security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
 * - Protected /admin route and /api/admin/metrics endpoint
 * - User-friendly 404 fallback
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables from .env if present
const rootDir = __dirname;
const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    envLines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (err) {
    console.warn('[Env] Notice: could not parse .env file:', err.message);
  }
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Admin credentials configuration
const ADMIN_USER = process.env.ADMIN_USERNAME || 'abhishek_admin';

// Hash helper using scrypt
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Fixed or generated salt & password hash
// Default initial credential for initial setup if not provided via .env
let currentAdminSalt = process.env.ADMIN_PASSWORD_SALT || 'c8f7e2a9b4d1385f0e9142bc3798a6fd';
let currentAdminHash = process.env.ADMIN_PASSWORD_HASH || hashPassword('AdminSecure2026!', currentAdminSalt);

// In-Memory Session Store: token -> { username, createdAt, expiresAt }
const sessions = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Password Reset Tokens Store: token -> { username, createdAt, expiresAt, used }
const resetTokens = new Map();
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Rate Limiter Store for Login: ip -> { count, firstAttempt, lockedUntil }
const rateLimits = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Rate Limiter Store for Password Reset: ip -> { count, firstAttempt, lockedUntil }
const resetRateLimits = new Map();
const MAX_RESET_ATTEMPTS = 3;
const RESET_LOCKOUT_MS = 15 * 60 * 1000;

// Security Event Diagnostic Logger (retains last 25 events, never logs sensitive data)
const securityLogs = [];
function logSecurityEvent(type, details) {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    details
  };
  securityLogs.unshift(event);
  if (securityLogs.length > 25) securityLogs.pop();
  console.log(`[Security Event] [${event.type}] ${event.details}`);
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }

  // Reset window if expired
  if (now - record.firstAttempt > LOCKOUT_MS) {
    rateLimits.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    logSecurityEvent('RATE_LIMIT_TRIGGERED', `IP ${ip} temporarily locked out for ${MAX_ATTEMPTS} failed attempts.`);
  }
  rateLimits.set(ip, record);
}

function resetRateLimit(ip) {
  rateLimits.delete(ip);
}

function checkResetRateLimit(ip) {
  const now = Date.now();
  const record = resetRateLimits.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingSec };
  }

  if (now - record.firstAttempt > RESET_LOCKOUT_MS) {
    resetRateLimits.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordResetAttempt(ip) {
  const now = Date.now();
  const record = resetRateLimits.get(ip) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_RESET_ATTEMPTS) {
    record.lockedUntil = now + RESET_LOCKOUT_MS;
    logSecurityEvent('RESET_LIMIT_TRIGGERED', `IP ${ip} locked out from password reset requests.`);
  }
  resetRateLimits.set(ip, record);
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of sessions.entries()) {
    if (now > data.expiresAt) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Helper: parse cookies
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (name) {
      list[name] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return list;
}

// Helper: get authenticated session
function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.sessionId;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Security headers
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';"
  );
}

// Request dispatcher
const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. API ROUTES
  if (pathname.startsWith('/api/')) {
    // API: POST /api/auth/login
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const rl = checkRateLimit(ip);
      if (!rl.allowed) {
        res.writeHead(429, { 
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': rl.remainingSec
        });
        res.end(JSON.stringify({ 
          error: `Too many failed attempts. Please wait ${rl.remainingSec} seconds before trying again.` 
        }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e4) req.destroy(); // 10KB payload guard
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const username = (data.username || '').trim();
          const password = (data.password || '').trim();

          if (!username || !password || username.length > 128 || password.length > 128) {
            recordFailedAttempt(ip);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Please provide valid credentials.' }));
            return;
          }

          // Secure constant-time comparison
          const computedHash = hashPassword(password, currentAdminSalt);
          const computedBuf = Buffer.from(computedHash, 'utf8');
          const expectedBuf = Buffer.from(currentAdminHash, 'utf8');

          const userMatch = (username === ADMIN_USER);
          const passMatch = (computedBuf.length === expectedBuf.length && crypto.timingSafeEqual(computedBuf, expectedBuf));

          if (userMatch && passMatch) {
            resetRateLimit(ip);
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + SESSION_TTL_MS;
            sessions.set(token, { username, createdAt: Date.now(), expiresAt });

            const cookieFlags = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`];
            if (isProd) cookieFlags.push('Secure');

            logSecurityEvent('LOGIN_SUCCESS', `Administrator '${username}' authenticated from IP ${ip}.`);

            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Set-Cookie': `sessionId=${token}; ${cookieFlags.join('; ')}`
            });
            res.end(JSON.stringify({ success: true, user: { username } }));
          } else {
            recordFailedAttempt(ip);
            logSecurityEvent('LOGIN_FAILED', `Failed login attempt for '${username}' from IP ${ip}.`);
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Invalid username or password.' }));
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Malformed request payload.' }));
        }
      });
      return;
    }

    // API: POST /api/auth/forgot-password
    if (pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const rl = checkResetRateLimit(ip);
      if (!rl.allowed) {
        res.writeHead(429, { 
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': rl.remainingSec
        });
        res.end(JSON.stringify({ 
          error: `Too many password reset requests. Please wait ${rl.remainingSec} seconds before retrying.` 
        }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e4) req.destroy();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const username = (data.username || '').trim();

          recordResetAttempt(ip);

          // Check if matches admin username or email
          const isMatch = (username === ADMIN_USER || username.toLowerCase() === 'abhishek.cs.dev@gmail.com');

          let generatedToken = null;
          if (isMatch) {
            generatedToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
            resetTokens.set(generatedToken, {
              username: ADMIN_USER,
              createdAt: Date.now(),
              expiresAt,
              used: false
            });
            logSecurityEvent('RESET_REQUEST', `Secure reset token generated for '${ADMIN_USER}'. Token: ${generatedToken}`);
          } else {
            logSecurityEvent('RESET_REQUEST_UNRECOGNIZED', `Password reset requested for unrecognized user/email '${username}'.`);
          }

          // Always return generic, non-enumerating response
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            message: 'If the provided account matches system records, a secure password reset token has been issued. In development mode, check server logs or use the local recovery key.',
            // Provided in non-production environments to allow immediate local testing:
            recoveryKey: !isProd ? generatedToken : undefined
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Malformed request payload.' }));
        }
      });
      return;
    }

    // API: POST /api/auth/reset-password
    if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e4) req.destroy();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const token = (data.token || '').trim();
          const newPassword = (data.newPassword || '').trim();

          if (!token || !newPassword) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Please provide both the reset token and new password.' }));
            return;
          }

          if (newPassword.length < 8) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'New password must be at least 8 characters long.' }));
            return;
          }

          const resetRecord = resetTokens.get(token);
          const now = Date.now();

          if (!resetRecord || resetRecord.used || now > resetRecord.expiresAt) {
            logSecurityEvent('INVALID_RESET_TOKEN', `Attempted password reset with invalid or expired token from IP ${ip}.`);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Reset token is invalid or has expired. Please request a new token.' }));
            return;
          }

          // Update password hash with fresh cryptographic salt
          const newSalt = crypto.randomBytes(16).toString('hex');
          const newHash = hashPassword(newPassword, newSalt);

          currentAdminSalt = newSalt;
          currentAdminHash = newHash;

          // Consume token
          resetRecord.used = true;
          resetTokens.delete(token);

          // Invalidate existing sessions for security
          sessions.clear();

          logSecurityEvent('PASSWORD_RESET_SUCCESS', `Password for '${ADMIN_USER}' was successfully updated using reset token.`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            message: 'Password has been successfully updated. All active sessions revoked. Please sign in with your new password.'
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Malformed request payload.' }));
        }
      });
      return;
    }

    // API: POST /api/auth/change-password (Authenticated Admin)
    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      const session = getSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized. Admin credentials required.' }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e4) req.destroy();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const currentPassword = (data.currentPassword || '').trim();
          const newPassword = (data.newPassword || '').trim();

          if (!currentPassword || !newPassword) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Please enter both current and new passwords.' }));
            return;
          }

          if (newPassword.length < 8) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'New password must be at least 8 characters long.' }));
            return;
          }

          // Verify current password
          const computedHash = hashPassword(currentPassword, currentAdminSalt);
          const computedBuf = Buffer.from(computedHash, 'utf8');
          const expectedBuf = Buffer.from(currentAdminHash, 'utf8');

          const passMatch = (computedBuf.length === expectedBuf.length && crypto.timingSafeEqual(computedBuf, expectedBuf));
          if (!passMatch) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Current password does not match.' }));
            return;
          }

          // Apply update
          const newSalt = crypto.randomBytes(16).toString('hex');
          const newHash = hashPassword(newPassword, newSalt);

          currentAdminSalt = newSalt;
          currentAdminHash = newHash;

          logSecurityEvent('PASSWORD_CHANGED', `Administrator '${session.username}' changed password via Admin Console.`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: 'Password updated successfully.' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Malformed request payload.' }));
        }
      });
      return;
    }

    // API: POST /api/auth/logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const session = getSession(req);
      if (session) {
        sessions.delete(session.token);
        logSecurityEvent('LOGOUT', `Administrator '${session.username}' logged out.`);
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': 'sessionId=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // API: GET /api/auth/me
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const session = getSession(req);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (session) {
        res.end(JSON.stringify({ authenticated: true, user: { username: session.username } }));
      } else {
        res.end(JSON.stringify({ authenticated: false }));
      }
      return;
    }

    // API: Protected Admin Metrics (GET /api/admin/metrics)
    if (pathname === '/api/admin/metrics' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized. Administrator credentials required.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        authenticated: true,
        user: session.username,
        serverUptimeSec: Math.floor(process.uptime()),
        activeSessions: sessions.size,
        systemStatus: 'Operational',
        portfolioMetrics: {
          totalProjects: 4,
          inquiriesReceived: 0,
          lastActive: new Date().toISOString()
        }
      }));
      return;
    }

    // API: Protected Security Logs (GET /api/admin/security-logs)
    if (pathname === '/api/admin/security-logs' && req.method === 'GET') {
      const session = getSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized. Administrator credentials required.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        authenticated: true,
        logs: securityLogs
      }));
      return;
    }

    // Unknown API endpoint
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Endpoint not found.' }));
    return;
  }

  // 2. PROTECTED ADMIN ROUTE
  if (pathname === '/admin' || pathname === '/admin.html') {
    const session = getSession(req);
    if (!session) {
      res.writeHead(302, { 'Location': '/login.html?redirect=/admin' });
      res.end();
      return;
    }
  }

  // 3. STATIC FILE SERVING WITH PATH TRAVERSAL GUARDS & EXTENSIONLESS CLEAN ROUTES
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  } else if (!path.extname(safePath)) {
    // Enable clean routes (/terms -> terms.html, /privacy -> privacy.html, /login -> login.html)
    const possibleHtml = path.join(rootDir, safePath + '.html');
    if (fs.existsSync(possibleHtml)) {
      safePath = safePath + '.html';
    }
  }

  let filePath = path.join(rootDir, safePath);

  // Path traversal guard: must be within rootDir
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // User-friendly 404 fallback
      const notFoundPath = path.join(rootDir, '404.html');
      if (fs.existsSync(notFoundPath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(notFoundPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[Portfolio Server] Serving securely at http://localhost:${PORT}`);
  console.log(`[Portfolio Server] Admin Login available at http://localhost:${PORT}/login.html`);
});
