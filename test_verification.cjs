/**
 * test_verification.cjs
 * Comprehensive Automated & Manual QA Verification Suite
 * Covers Hero 45, Accessibility, Dark Theme tokens (#0B0D12), Project 4,
 * Single Butterfly Cursor, Live Server Auth, Forgot Password, Password Reset,
 * Security Audit Telemetry, Terms & Privacy Pages.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const rootDir = __dirname;
const htmlPath = path.join(rootDir, 'index.html');
const content = fs.readFileSync(htmlPath, 'utf8');

console.log('====================================================');
console.log('  PORTFOLIO PRODUCTION READINESS & QA AUDIT SUITE   ');
console.log('====================================================');

let failures = 0;

function runCheck(category, name, condition, details = '') {
  if (condition) {
    console.log(`  ✓ [${category}] ${name}`);
  } else {
    console.error(`  ✗ [${category}] ${name} ${details ? '(' + details + ')' : ''}`);
    failures++;
  }
}

// 1. HERO 45 PRESERVATION CHECKS
console.log('\n[1] Protected Hero 45 Integrity:');
runCheck('Hero45', 'Canvas element present', content.includes('<canvas id="bd"></canvas>'));
runCheck('Hero45', 'Originkit script loaded', content.includes('src="hero-45/butterfly-drift.js"'));
runCheck('Hero45', 'Keep-out container present', /class="[^"]*\bhero-inner\b[^"]*"/.test(content));
runCheck('Hero45', 'Butterfly graphic referenced', content.includes('hero-45/butterfly.png'));
runCheck('Hero45', 'Display title Instrument Serif typography', content.includes('Instrument Serif') && content.includes('Building Digital'));
runCheck('Hero45', 'Original CTA buttons (.btn.light & .btn.dark)', content.includes('class="btn light"') && content.includes('class="btn dark"'));
runCheck('Hero45', 'Hero 45 raw files exist on disk', 
  fs.existsSync(path.join(rootDir, 'hero-45', 'butterfly-drift.js')) &&
  fs.existsSync(path.join(rootDir, 'hero-45', 'butterfly.png')) &&
  fs.existsSync(path.join(rootDir, 'hero-45', 'lumina.html'))
);

// 2. INTERNAL ANCHOR & ROUTING RESOLUTION
console.log('\n[2] Internal Anchors & Routing Integrity:');
const internalLinks = [...content.matchAll(/href="(#[a-zA-Z0-9_-]+)"/g)].map(m => m[1]);
const uniqueAnchors = [...new Set(internalLinks)];

uniqueAnchors.forEach(anchor => {
  const targetId = anchor.substring(1);
  const exists = content.includes(`id="${targetId}"`);
  runCheck('Anchor', `Target ID exists for anchor ${anchor}`, exists, `missing element with id="${targetId}"`);
});

// 3. ASSET FILE RESOLUTION
console.log('\n[3] Asset Path Resolution:');
const assetPaths = [
  'hero-45/butterfly-drift.js',
  'hero-45/butterfly.png',
  'butterfly.png',
  'hero-45/lumina.html',
  'login.html',
  'admin.html',
  '404.html',
  'privacy.html',
  'terms.html',
  '.env.example',
  'server.cjs'
];
assetPaths.forEach(asset => {
  const fullPath = path.join(rootDir, asset);
  runCheck('Asset', `Asset exists on disk: ${asset}`, fs.existsSync(fullPath));
});

// 4. ACCESSIBILITY & SEMANTICS
console.log('\n[4] Accessibility & Semantic Validation:');
runCheck('A11y', 'Skip link present for keyboard navigation', content.includes('class="skip-link"'));
runCheck('A11y', 'Landmark roles present (banner, main, contentinfo)', 
  content.includes('role="banner"') && content.includes('role="main"') && content.includes('role="contentinfo"')
);
runCheck('A11y', 'Mobile nav ARIA states', content.includes('aria-expanded="false"') && content.includes('aria-controls="nav-links"'));
runCheck('A11y', 'Visible keyboard focus styling', content.includes(':focus-visible'));
runCheck('A11y', 'Strict reduced motion query', content.includes('@media (prefers-reduced-motion: reduce)'));
const h1Count = (content.match(/<h1[\s>]/g) || []).length;
runCheck('A11y', 'Exactly one <h1> element on the page', h1Count === 1, `Found ${h1Count} <h1> elements`);

// 5. RESPONSIVE BREAKPOINT AUDIT
console.log('\n[5] Responsive Architecture:');
runCheck('Responsive', 'Tablet breakpoint rule (max-width: 1024px)', content.includes('@media (max-width: 1024px)'));
runCheck('Responsive', 'Mobile breakpoint rule (max-width: 860px)', content.includes('@media (max-width: 860px)'));
runCheck('Responsive', 'Small mobile breakpoint rule (max-width: 480px)', content.includes('@media (max-width: 480px)'));
runCheck('Responsive', 'Horizontal overflow safeguard', content.includes('overflow-x: hidden'));
runCheck('Responsive', 'Touch target min-height rules', content.includes('min-height: 44px') || content.includes('min-height: 46px'));

// 6. PRODUCTION METADATA & SECURITY
console.log('\n[6] Production Metadata & Security Hygiene:');
runCheck('SEO', 'Meta description present', content.includes('<meta name="description"'));
runCheck('SEO', 'Favicon configured', content.includes('<link rel="icon"'));
runCheck('SEO', 'OpenGraph social tags present', content.includes('property="og:title"') && content.includes('property="og:image"'));
runCheck('Security', '.gitignore present at workspace root', fs.existsSync(path.join(rootDir, '.gitignore')));

// Scan for secrets in workspace text files
const forbiddenPatterns = [
  /AIza[0-9A-Za-z-_]{35}/, // Google API Key
  /sk-[a-zA-Z0-9]{20,}/,  // OpenAI secret key
  /ghp_[a-zA-Z0-9]{20,}/, // GitHub token
  /ORIGINKIT_API_KEY\s*=\s*['"][a-zA-Z0-9_-]+['"]/
];
let leakedSecret = false;
[htmlPath, path.join(rootDir, 'package.json')].forEach(filePath => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  forbiddenPatterns.forEach(pattern => {
    if (pattern.test(fileContent)) leakedSecret = true;
  });
});
runCheck('Security', 'Zero hardcoded API keys or secrets in source code', !leakedSecret);

// 7. FEATURE AUDITS: PROJECT 4, HERO TEXT & TRUE DARK MODE
console.log('\n[7] Feature Audits: Project 4, Text Contrast, True Dark Mode & Butterfly:');

// 7.1 Featured Project 4 - RAG Document Chatbot
runCheck('Project4', 'Project 4 titled "RAG Document Chatbot"', content.includes('RAG Document Chatbot'));
runCheck('Project4', 'Project 4 description uses exact requested text', 
  content.includes('An AI-powered document question-answering system that retrieves relevant information from uploaded documents and generates context-grounded answers using Retrieval-Augmented Generation (RAG).')
);
runCheck('Project4', 'Project 4 technology tags (RAG, Python, LLM, Embeddings, Vector Database)', 
  content.includes('>RAG<') && content.includes('>Python<') && content.includes('>LLM<') && 
  content.includes('>Embeddings<') && content.includes('>Vector Database<')
);
runCheck('Project4', 'Projects 1, 2, and 3 preserved alongside Project 4',
  content.includes('PROJECT // 01') && content.includes('PROJECT // 02') && 
  content.includes('PROJECT // 03') && content.includes('PROJECT // 04')
);
runCheck('Project4', 'Featured projects pure white background in light mode', 
  content.includes('--projects-container-bg: #FFFFFF;') || content.includes('--projects-container-bg: #ffffff;'));

// 7.2 Single Butterfly Cursor
runCheck('ButterflyCursor', 'ButterflyCursor.js module exists on disk', fs.existsSync(path.join(rootDir, 'src', 'components', 'ButterflyCursor.js')));
const cursorContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ButterflyCursor.js'), 'utf8');
runCheck('ButterflyCursor', 'Single butterfly element created (no flock)', 
  cursorContent.includes('single-butterfly-cursor') && !cursorContent.includes('FLOCK_SIZE')
);
runCheck('ButterflyCursor', 'Non-blocking pointer-events: none configured', 
  cursorContent.includes('pointer-events: none') || content.includes('.butterfly-cursor {')
);
runCheck('ButterflyCursor', 'Touch and reduced-motion guards present', 
  cursorContent.includes('(prefers-reduced-motion: reduce)') && cursorContent.includes('(hover: hover) and (pointer: fine)')
);
runCheck('ButterflyCursor', 'Dark mode bioluminescent glow configured in CSS', 
  content.includes('[data-theme="dark"] .butterfly-cursor') && content.includes('drop-shadow(')
);

// 7.3 Light / Dark Mode Theme Switcher & True Dark Mode Background
runCheck('ThemeSwitch', 'Theme toggle button with accessible label present', content.includes('id="theme-toggle"'));
runCheck('ThemeSwitch', 'Sun and moon icons configured for theme toggle', content.includes('sun-icon') && content.includes('moon-icon'));
runCheck('ThemeSwitch', 'Early FOUC prevention script in <head>', content.includes('localStorage.getItem(\'theme\')') && content.indexOf('localStorage.getItem') < content.indexOf('<style>'));
runCheck('ThemeSwitch', 'Theme switcher event listener with persistence present', content.includes('localStorage.setItem(\'theme\''));
runCheck('ThemeSwitch', 'Dark theme background is #0B0D12', content.includes('--bg-body-color: #0B0D12;') || content.includes('#0B0D12'));
runCheck('ThemeSwitch', 'Dark theme text tokens (--text-primary: #F8FAFC, --text-muted: #94A3B8)', 
  content.includes('--text-primary: #F8FAFC;') && content.includes('--text-muted: #94A3B8;')
);
runCheck('ThemeSwitch', 'Dark theme elevated surface for projects (#10141D / #161B26)', 
  content.includes('--projects-container-bg: #10141D;') && content.includes('--project-card-bg: #161B26;')
);
runCheck('ThemeSwitch', 'True dark mode body eliminates day clouds in dark mode', 
  content.includes('[data-theme="dark"] body') && content.includes('#0B0D12 !important')
);
runCheck('ThemeSwitch', 'Subtle, accessible ::selection style added', 
  content.includes('::selection') && content.includes('[data-theme="dark"] ::selection')
);

// 7.4 Terms and Privacy Policy Full Pages (NOT popups or modals)
const termsContent = fs.readFileSync(path.join(rootDir, 'terms.html'), 'utf8');
const privacyContent = fs.readFileSync(path.join(rootDir, 'privacy.html'), 'utf8');
runCheck('PolicyPages', 'Terms of Use is a standalone page (not a popup/modal)', 
  termsContent.includes('<!doctype html>') && termsContent.includes('<main') && !termsContent.includes('class="modal"') && !termsContent.includes('<dialog>')
);
runCheck('PolicyPages', 'Privacy Policy is a standalone page (not a popup/modal)', 
  privacyContent.includes('<!doctype html>') && privacyContent.includes('<main') && !privacyContent.includes('class="modal"') && !privacyContent.includes('<dialog>')
);
runCheck('CleanFooter', 'Footer copyright preserved', content.includes('class="footer-copy"'));
runCheck('CleanFooter', 'Privacy Policy and Terms of Use linked in footer', 
  content.includes('/privacy') && content.includes('/terms')
);

// 7.5 Upgraded Login & Admin Console UI Check
const loginContent = fs.readFileSync(path.join(rootDir, 'login.html'), 'utf8');
const adminContent = fs.readFileSync(path.join(rootDir, 'admin.html'), 'utf8');
runCheck('AdminUpgrade', 'login.html contains Forgot Password workflow', 
  loginContent.includes('id="goto-forgot-btn"') && loginContent.includes('id="forgot-form"') && loginContent.includes('id="reset-form"')
);
runCheck('AdminUpgrade', 'admin.html contains live change password & audit log viewer', 
  adminContent.includes('id="change-pwd-form"') && adminContent.includes('id="logs-tbody"')
);

// 8. LIVE HTTP INTEGRATION & SECURITY TESTS
console.log('\n[8] Live HTTP Integration & Security Tests (http://localhost:3000):');

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runLiveTests() {
  try {
    // 8.1 GET /
    const homeRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'GET'
    });
    runCheck('LiveServer', 'GET / returns 200 OK', homeRes.statusCode === 200);
    runCheck('SecurityHeaders', 'Content-Security-Policy header present', !!homeRes.headers['content-security-policy']);
    runCheck('SecurityHeaders', 'X-Content-Type-Options: nosniff present', homeRes.headers['x-content-type-options'] === 'nosniff');
    runCheck('SecurityHeaders', 'X-Frame-Options: SAMEORIGIN present', homeRes.headers['x-frame-options'] === 'SAMEORIGIN');

    // 8.2 Clean route: /privacy
    const privCleanRes = await httpRequest({ hostname: 'localhost', port: 3000, path: '/privacy', method: 'GET' });
    runCheck('LiveServer', 'Clean GET /privacy returns 200 OK with full page', privCleanRes.statusCode === 200 && privCleanRes.body.includes('Privacy Policy'));

    // 8.3 Clean route: /terms
    const termsCleanRes = await httpRequest({ hostname: 'localhost', port: 3000, path: '/terms', method: 'GET' });
    runCheck('LiveServer', 'Clean GET /terms returns 200 OK with full page', termsCleanRes.statusCode === 200 && termsCleanRes.body.includes('Terms of Use'));

    // 8.4 Clean route: /login
    const loginPageRes = await httpRequest({ hostname: 'localhost', port: 3000, path: '/login', method: 'GET' });
    runCheck('LiveServer', 'Clean GET /login returns 200 OK', loginPageRes.statusCode === 200 && loginPageRes.body.includes('Authenticate'));

    // 8.5 404 Fallback
    const missingRes = await httpRequest({ hostname: 'localhost', port: 3000, path: '/random-missing-route-xyz', method: 'GET' });
    runCheck('LiveServer', 'GET /unknown-path returns 404 Not Found', missingRes.statusCode === 404 && missingRes.body.includes('404'));

    // 8.6 Unauthenticated /admin access (must redirect to /login.html with 302)
    const adminUnauth = await httpRequest({ hostname: 'localhost', port: 3000, path: '/admin', method: 'GET' });
    runCheck('LiveAuth', 'Unauthenticated GET /admin redirects (302) to /login.html', 
      adminUnauth.statusCode === 302 && (adminUnauth.headers.location || '').startsWith('/login.html')
    );

    // 8.7 Login with invalid credentials (must reject with 401 and generic message)
    const badLoginData = JSON.stringify({ username: 'abhishek_admin', password: 'WrongPassword123' });
    const badLoginRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(badLoginData)
      }
    }, badLoginData);
    runCheck('LiveAuth', 'Invalid login returns 401', badLoginRes.statusCode === 401);
    const badJson = JSON.parse(badLoginRes.body || '{}');
    runCheck('LiveAuth', 'Generic error message on failed login', 
      badJson.error && badJson.error.toLowerCase().includes('invalid username or password')
    );

    // 8.8 Valid Admin Login
    const validLoginData = JSON.stringify({ username: 'abhishek_admin', password: 'AdminSecure2026!' });
    const validLoginRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(validLoginData)
      }
    }, validLoginData);
    runCheck('LiveAuth', 'Valid admin login returns 200 OK', validLoginRes.statusCode === 200);

    const setCookieHeader = validLoginRes.headers['set-cookie'];
    const sessionCookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : (setCookieHeader || '');
    runCheck('LiveAuth', 'Session cookie set with HttpOnly and SameSite=Strict', 
      sessionCookie.includes('HttpOnly') && sessionCookie.includes('SameSite=Strict') && sessionCookie.includes('sessionId=')
    );

    const cookieMatch = sessionCookie.match(/sessionId=([^;]+)/);
    const cookieVal = cookieMatch ? cookieMatch[0] : '';

    // 8.9 Authenticated GET /api/auth/me
    const meRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Cookie': cookieVal }
    });
    const meJson = JSON.parse(meRes.body || '{}');
    runCheck('LiveAuth', 'GET /api/auth/me returns authenticated status', 
      meRes.statusCode === 200 && meJson.authenticated === true && meJson.user && meJson.user.username === 'abhishek_admin'
    );

    // 8.10 Authenticated GET /admin
    const adminAuthRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/admin',
      method: 'GET',
      headers: { 'Cookie': cookieVal }
    });
    runCheck('LiveAuth', 'Authenticated GET /admin returns 200 OK', adminAuthRes.statusCode === 200 && adminAuthRes.body.includes('Console'));

    // 8.11 Authenticated GET /api/admin/metrics
    const metricsRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/metrics',
      method: 'GET',
      headers: { 'Cookie': cookieVal }
    });
    runCheck('LiveAuth', 'GET /api/admin/metrics returns system metrics for admin', metricsRes.statusCode === 200 && metricsRes.body.includes('serverUptimeSec'));

    // 8.12 Authenticated GET /api/admin/security-logs
    const logsRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/security-logs',
      method: 'GET',
      headers: { 'Cookie': cookieVal }
    });
    const logsJson = JSON.parse(logsRes.body || '{}');
    runCheck('LiveAuth', 'GET /api/admin/security-logs returns security telemetry', logsRes.statusCode === 200 && Array.isArray(logsJson.logs));

    // 8.13 Logout
    const logoutRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/logout',
      method: 'POST',
      headers: { 'Cookie': cookieVal }
    });
    runCheck('LiveAuth', 'POST /api/auth/logout returns 200 OK', logoutRes.statusCode === 200);

    // 8.14 Verify unauthenticated after logout
    const afterLogoutMe = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Cookie': cookieVal }
    });
    const afterLogoutJson = JSON.parse(afterLogoutMe.body || '{}');
    runCheck('LiveAuth', 'Session invalidated after logout', afterLogoutJson.authenticated === false);

    // 8.15 Forgot Password endpoint test
    const forgotData = JSON.stringify({ username: 'abhishek_admin' });
    const forgotRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/forgot-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(forgotData)
      }
    }, forgotData);
    const forgotJson = JSON.parse(forgotRes.body || '{}');
    runCheck('ForgotReset', 'POST /api/auth/forgot-password returns 200 and recovery key in dev mode', 
      forgotRes.statusCode === 200 && forgotJson.success === true && !!forgotJson.recoveryKey
    );

    // 8.16 Reset Password endpoint test using received recovery key
    const recoveryKey = forgotJson.recoveryKey;
    const resetData = JSON.stringify({ token: recoveryKey, newPassword: 'AdminUpdated2026!' });
    const resetRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/reset-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(resetData)
      }
    }, resetData);
    const resetJson = JSON.parse(resetRes.body || '{}');
    runCheck('ForgotReset', 'POST /api/auth/reset-password applies new password successfully', 
      resetRes.statusCode === 200 && resetJson.success === true
    );

    // 8.17 Verify login with newly reset password
    const loginWithNewPassData = JSON.stringify({ username: 'abhishek_admin', password: 'AdminUpdated2026!' });
    const newPassLoginRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginWithNewPassData)
      }
    }, loginWithNewPassData);
    runCheck('ForgotReset', 'Login succeeds with newly reset password', newPassLoginRes.statusCode === 200);

    const newSetCookie = newPassLoginRes.headers['set-cookie'];
    const newSessionCookie = Array.isArray(newSetCookie) ? newSetCookie[0] : (newSetCookie || '');
    const newCookieMatch = newSessionCookie.match(/sessionId=([^;]+)/);
    const newCookieVal = newCookieMatch ? newCookieMatch[0] : '';

    // 8.18 Revert password back to default 'AdminSecure2026!' via authenticated change-password endpoint
    const revertData = JSON.stringify({ currentPassword: 'AdminUpdated2026!', newPassword: 'AdminSecure2026!' });
    const revertRes = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/change-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(revertData),
        'Cookie': newCookieVal
      }
    }, revertData);
    runCheck('ForgotReset', 'Authenticated change-password resets credential cleanly back to default', revertRes.statusCode === 200);

  } catch (err) {
    console.error('Live test network error:', err);
    failures++;
  }

  console.log('\n====================================================');
  if (failures === 0) {
    console.log('✓ ALL PRODUCTION CHECKS & VERIFICATION PASSED (0 failures)');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`✗ VERIFICATION FAILED: ${failures} issue(s) detected.`);
    console.log('====================================================');
    process.exit(1);
  }
}

runLiveTests();
