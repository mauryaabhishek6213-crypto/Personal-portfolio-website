/**
 * ButterflyCursor.js
 * Single Animated Butterfly Following Mouse Cursor with Light/Dark Glow Adaptation.
 * 
 * Features:
 * - Exactly ONE elegant animated butterfly (32px × 32px)
 * - Smooth interpolation (lerp) with organic sinusoidal floating drift
 * - Natural wing-flapping and smooth flight banking toward heading
 * - Theme-adaptive: Subtle natural violet/lavender/blue in Light Mode,
 *   soft bioluminescent glow in Dark Mode
 * - pointer-events: none (never interferes with clicks, text selection, or buttons)
 * - Native system cursor is preserved
 * - Zero memory leaks: clean destroy() method and single requestAnimationFrame loop
 * - Respects prefers-reduced-motion and disables on touch-only devices
 */

let activeInstance = null;

export function initButterflyCursor() {
  // If an instance is already active, cleanly destroy it before re-initializing
  if (activeInstance && typeof activeInstance.destroy === 'function') {
    activeInstance.destroy();
    activeInstance = null;
  }

  // Respect user preference for reduced motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { destroy: () => {} };
  }

  // Only activate on devices with fine pointer (mouse / trackpad)
  if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    return { destroy: () => {} };
  }

  // Remove any legacy flock container if present
  const oldFlock = document.getElementById('butterfly-flock-container');
  if (oldFlock) {
    oldFlock.remove();
  }

  // Retrieve or create single butterfly element
  let butterflyEl = document.getElementById('single-butterfly-cursor');
  if (!butterflyEl) {
    butterflyEl = document.createElement('div');
    butterflyEl.id = 'single-butterfly-cursor';
    butterflyEl.className = 'butterfly-cursor';
    butterflyEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(butterflyEl);
  }

  // Set up inner SVG structure with violet, lavender, and cyan gradient palette
  butterflyEl.innerHTML = `
    <div class="butterfly-cursor-inner">
      <svg viewBox="0 0 44 44" class="butterfly-cursor-svg">
        <defs>
          <linearGradient id="single-bf-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8b5cf6" />
            <stop offset="50%" stop-color="#a855f7" />
            <stop offset="100%" stop-color="#00DAFF" />
          </linearGradient>
          <linearGradient id="single-bf-bot" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7c3aed" />
            <stop offset="60%" stop-color="#c084fc" />
            <stop offset="100%" stop-color="#38bdf8" />
          </linearGradient>
          <filter id="single-bf-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="#a855f7" flood-opacity="0.45"/>
          </filter>
        </defs>
        <g class="butterfly-svg-group" filter="url(#single-bf-glow)">
          <g class="cursor-wing-left">
            <path class="cursor-wing-top" d="M21 19 C16 9, 3 8, 4 19 C5 26, 16 23, 21 21 Z" fill="url(#single-bf-top)" opacity="0.95"/>
            <path class="cursor-wing-bottom" d="M21 21 C15 23, 6 25, 7 31 C8 35, 17 31, 21 23 Z" fill="url(#single-bf-bot)" opacity="0.9"/>
          </g>
          <g class="cursor-wing-right">
            <path class="cursor-wing-top" d="M23 19 C28 9, 41 8, 40 19 C39 26, 28 23, 23 21 Z" fill="url(#single-bf-top)" opacity="0.95"/>
            <path class="cursor-wing-bottom" d="M23 21 C29 23, 38 25, 37 31 C36 35, 27 31, 23 23 Z" fill="url(#single-bf-bot)" opacity="0.9"/>
          </g>
          <!-- Body and Head -->
          <ellipse cx="22" cy="21" rx="1.6" ry="6" fill="#3b0764" class="butterfly-body"/>
          <ellipse cx="22" cy="15" rx="1.3" ry="1.3" fill="#3b0764" class="butterfly-head"/>
          <!-- Antennae -->
          <path d="M21.5 14.5 C20 10, 16.5 8, 13.5 8 M22.5 14.5 C24 10, 27.5 8, 30.5 8" stroke="#3b0764" stroke-width="0.9" fill="none" stroke-linecap="round" class="butterfly-antennae"/>
        </g>
      </svg>
    </div>
  `;

  let mouseX = -100, mouseY = -100;
  let curX = -100, curY = -100;
  let prevX = -100, prevY = -100;
  let angle = 0;
  let hasMoved = false;
  let rafId = null;
  let time = 0;

  const LERP_FACTOR = 0.1; // Smooth natural follow speed

  const onPointerMove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!hasMoved) {
      curX = mouseX;
      curY = mouseY;
      prevX = curX;
      prevY = curY;
      hasMoved = true;
    }
    butterflyEl.classList.add('visible');
  };

  const onMouseLeave = () => {
    butterflyEl.classList.remove('visible');
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('mouseleave', onMouseLeave);

  const animate = () => {
    time += 1;

    if (hasMoved) {
      // Gentle sinusoidal floating drift
      const driftX = Math.sin(time * 0.045) * 4;
      const driftY = Math.cos(time * 0.038) * 3;

      const targetX = mouseX + 16 + driftX;
      const targetY = mouseY + 14 + driftY;

      // Smooth interpolation toward target
      curX += (targetX - curX) * LERP_FACTOR;
      curY += (targetY - curY) * LERP_FACTOR;

      const dx = curX - prevX;
      const dy = curY - prevY;
      const speed = Math.hypot(dx, dy);

      // Smooth banking rotation toward movement heading
      if (speed > 0.4) {
        const targetAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
        let diff = (targetAngle - angle) % 360;
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;
        angle += Math.max(-12, Math.min(12, diff * 0.16));
      }

      prevX = curX;
      prevY = curY;

      butterflyEl.style.transform = `translate3d(${curX}px, ${curY}px, 0) rotate(${angle}deg)`;
    }

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);

  const instance = {
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      if (butterflyEl && butterflyEl.parentNode) {
        butterflyEl.parentNode.removeChild(butterflyEl);
      }
      activeInstance = null;
    }
  };

  activeInstance = instance;
  return instance;
}
