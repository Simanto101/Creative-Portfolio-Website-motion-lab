/**
 * SIMANTO MITRO — LAB v3 ENGINE
 * Canvas scroll film (193 frames) mapped to the pinned hero track, with the
 * progressive loader + pre-decode machinery from the production engine.
 * After the hero, light editorial chapters take over (GSAP ScrollTrigger).
 * Frames are only ever drawn to canvas — never modified.
 */
document.addEventListener('DOMContentLoaded', () => {
  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const lerp = (a, b, t) => a + (b - a) * t;

  // =========================================================================
  // 1. LENIS SMOOTH SCROLL (skipped for reduced motion)
  // =========================================================================
  let lenis = null;
  if (typeof Lenis !== 'undefined' && hasGSAP && !reduceMotion) {
    lenis = new Lenis({
      duration: isTouch ? 1.0 : 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.15
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // =========================================================================
  // 2. CANVAS SCROLL FILM — mapped to the hero track's scroll range
  // =========================================================================
  const TOTAL_FRAMES = 193;
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const stage = document.getElementById('film-stage');
  const heroTrack = document.getElementById('hero-track');
  const railFill = document.getElementById('rail-fill');
  const scrollCue = document.getElementById('scroll-cue');
  const plxEls = Array.prototype.slice.call(document.querySelectorAll('[data-plx]'));
  const DARK = '#060b18';
  const MOBILE_FRAME_W = 828;

  const ASSET_BASE = 'https://simanto101.github.io/Creative-Portfolio-Website/';
  let frameDir = window.innerWidth < 768 ? 'frames-mobile' : 'frames-desktop';
  const getFrameUrl = (n) => `${ASSET_BASE}${frameDir}/frame-${String(n).padStart(3, '0')}.webp`;

  let frameImages = new Array(TOTAL_FRAMES);
  let loadedIndices = new Set();
  let decodedIndices = new Set();
  const decodeQueue = [];
  let decodeBusy = 0;
  let loadToken = 0;
  let targetProgress = 0;   // global page progress (rail)
  let smoothHero = 0;        // smoothed hero-track progress (film + parallax)

  function heroRange() {
    if (!heroTrack) return 1;
    return Math.max(1, heroTrack.offsetHeight - window.innerHeight);
  }
  function heroTarget() {
    return clamp01((window.scrollY || 0) / heroRange());
  }

  function resizeCanvas() {
    if (!canvas) return;
    const mobileNow = window.innerWidth < 768;
    const wantDir = mobileNow ? 'frames-mobile' : 'frames-desktop';
    if (wantDir !== frameDir) { frameDir = wantDir; startLoading(); }
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (mobileNow) dpr = Math.min(dpr, MOBILE_FRAME_W / window.innerWidth);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    render();
  }
  window.addEventListener('resize', resizeCanvas);

  // Progressive loading: frame 1 first (instant hero), then every 4th, then fill.
  function startLoading() {
    const token = ++loadToken;
    frameImages = new Array(TOTAL_FRAMES);
    loadedIndices = new Set();
    decodedIndices = new Set();
    decodeQueue.length = 0;
    const order = [];
    for (let i = 4; i < TOTAL_FRAMES; i += 4) order.push(i);
    for (let i = 1; i < TOTAL_FRAMES; i++) if (i % 4 !== 0) order.push(i);
    let next = 0;
    const CONCURRENCY = 6;
    const milestoneCount = Math.floor((TOTAL_FRAMES - 1) / 4);
    let fillAllowed = document.readyState === 'complete';
    const allowFill = () => {
      if (fillAllowed) return;
      fillAllowed = true;
      for (let c = 0; c < CONCURRENCY; c++) pump();
    };
    if (!fillAllowed) {
      window.addEventListener('load', () => setTimeout(allowFill, 300), { once: true });
      window.addEventListener('scroll', allowFill, { once: true, passive: true });
    }
    const loadOne = (idx, done) => {
      const img = new Image();
      img.decoding = 'async';
      if (idx === 0 && 'fetchPriority' in img) img.fetchPriority = 'high';
      img.onload = () => {
        if (token !== loadToken) return;
        frameImages[idx] = img;
        loadedIndices.add(idx);
        queueDecode(idx);
        if (idx === 0) resizeCanvas();
        done();
      };
      img.onerror = () => { if (token === loadToken) done(); };
      img.src = getFrameUrl(idx + 1);
    };
    const pump = () => {
      if (token !== loadToken || next >= order.length) return;
      if (next >= milestoneCount && !fillAllowed) return;
      loadOne(order[next++], pump);
    };
    const startPumps = () => { for (let c = 0; c < CONCURRENCY; c++) pump(); };
    loadOne(0, () => {
      if (document.readyState === 'complete') startPumps();
      else window.addEventListener('load', startPumps, { once: true });
    });
  }
  startLoading();

  // Pre-decode ahead of the playhead so drawImage never pays a sync decode.
  function queueDecode(idx, front) {
    if (idx < 0 || idx >= TOTAL_FRAMES || decodedIndices.has(idx)) return;
    const at = decodeQueue.indexOf(idx);
    if (at !== -1) {
      if (front) { decodeQueue.splice(at, 1); decodeQueue.unshift(idx); }
      return;
    }
    if (front) decodeQueue.unshift(idx); else decodeQueue.push(idx);
    pumpDecode();
  }
  function pumpDecode() {
    while (decodeBusy < 2 && decodeQueue.length) {
      const idx = decodeQueue.shift();
      const img = frameImages[idx];
      if (!img || decodedIndices.has(idx)) continue;
      decodedIndices.add(idx);
      if (!img.decode) continue;
      decodeBusy++;
      img.decode().catch(() => {}).finally(() => { decodeBusy--; pumpDecode(); });
    }
  }

  function getBestLoadedImage(exactIdx) {
    const target = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(exactIdx)));
    if (loadedIndices.has(target)) return frameImages[target];
    for (let r = 1; r < TOTAL_FRAMES; r++) {
      if (target - r >= 0 && loadedIndices.has(target - r)) return frameImages[target - r];
      if (target + r < TOTAL_FRAMES && loadedIndices.has(target + r)) return frameImages[target + r];
    }
    return null;
  }

  // Same timing curve as production: 0.42 knee, 65/96 split.
  function desktopFrameFromProgress(p) {
    const k = 65 / 96;
    const frac = p <= 0.42 ? (p / 0.42) * k : k + ((p - 0.42) / 0.58) * (1 - k);
    return frac * (TOTAL_FRAMES - 1);
  }

  function drawDesktop(img, cw, ch) {
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const nw = Math.ceil(img.naturalWidth * scale);
    const nh = Math.ceil(img.naturalHeight * scale);
    ctx.drawImage(img, Math.floor((cw - nw) / 2), Math.floor((ch - nh) / 2), nw, nh);
  }
  function drawMobile(img, cw, ch) {
    const nh = Math.round(img.naturalHeight * (cw / img.naturalWidth));
    if (nh < ch) {
      ctx.fillStyle = DARK;
      ctx.fillRect(0, nh - 1, cw, ch - nh + 1);
    }
    ctx.drawImage(img, 0, 0, cw, nh);
  }

  let lastDrawn = null;
  let lastSize = '';
  function render() {
    if (!ctx || !canvas) return;
    const mobileNow = window.innerWidth < 768;
    const exactFrame = desktopFrameFromProgress(clamp01(smoothHero));
    const ahead = Math.round(exactFrame);
    for (let k = 10; k >= 1; k--) queueDecode(ahead + k, true);
    const img = getBestLoadedImage(exactFrame);
    if (img && img.complete && img.naturalWidth) {
      const size = canvas.width + 'x' + canvas.height;
      if (img !== lastDrawn || size !== lastSize) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (mobileNow) drawMobile(img, canvas.width, canvas.height);
        else drawDesktop(img, canvas.width, canvas.height);
        lastDrawn = img;
        lastSize = size;
      }
    }
  }

  // Hero copy parallax + stage fade + rail, driven from the same rAF loop.
  let lastStageOpacity = -1;
  function applyChrome() {
    const y = window.scrollY || 0;
    // Progress rail = whole page
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = clamp01(y / max);
    if (railFill) railFill.style.transform = `scaleY(${targetProgress.toFixed(4)})`;
    // Film stage fades away as the hero track ends
    if (stage) {
      const range = heroRange();
      const fadeStart = range - window.innerHeight * 0.45;
      const o = y <= fadeStart ? 1 : Math.max(0, 1 - (y - fadeStart) / (window.innerHeight * 0.6));
      const rounded = Math.round(o * 100) / 100;
      if (rounded !== lastStageOpacity) {
        stage.style.opacity = String(rounded);
        stage.style.visibility = rounded <= 0 ? 'hidden' : 'visible';
        lastStageOpacity = rounded;
      }
    }
    // Parallax layers (data-plx = rate multiplier; 1 = name block)
    if (!reduceMotion) {
      const p = smoothHero;
      for (const el of plxEls) {
        const rate = parseFloat(el.getAttribute('data-plx')) || 1;
        el.style.transform = `translate3d(0, ${(-64 * rate * p).toFixed(1)}px, 0)`;
      }
      const sub = document.querySelector('.hero-sub');
      if (sub) sub.style.opacity = String(1 - clamp01((p - 0.3) / 0.45));
      const nm = document.querySelector('.hero-name-block');
      if (nm) nm.style.opacity = String(1 - clamp01((p - 0.62) / 0.38) * 0.85);
      if (scrollCue) scrollCue.style.opacity = String(p < 0.03 ? 1 : Math.max(0, 1 - (p - 0.03) / 0.05));
    }
  }

  function raf() {
    const lerpSpeed = reduceMotion ? 1 : (isTouch ? 0.16 : 0.11);
    const target = reduceMotion ? 0 : heroTarget();
    smoothHero += (target - smoothHero) * lerpSpeed;
    if (Math.abs(target - smoothHero) < 0.0005) smoothHero = target;
    render();
    applyChrome();
    requestAnimationFrame(raf);
  }
  resizeCanvas();
  requestAnimationFrame(raf);

  // =========================================================================
  // 3. MOBILE MENU
  // =========================================================================
  const burger = document.getElementById('nav-burger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (burger && mobileMenu) {
    const setMenu = (open) => {
      mobileMenu.classList.toggle('open', open);
      mobileMenu.setAttribute('aria-hidden', String(!open));
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (lenis) { if (open) lenis.stop(); else lenis.start(); }
    };
    burger.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
    mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  // In-page anchors (brand, scroll cue targets) — smooth via Lenis when present
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (id === '#') return;
      const targetEl = document.querySelector(id);
      if (!targetEl) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(targetEl, { duration: 1.4 });
      else targetEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  // =========================================================================
  // 4. CHAPTER CHOREOGRAPHY (GSAP ScrollTrigger)
  // =========================================================================
  if (hasGSAP && !reduceMotion) {
    // Hero intro: layered rise on load
    const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
    intro
      .from('.hero-eyebrow', { y: 24, opacity: 0, duration: 0.9 }, 0.15)
      .from('.hero-top-right', { y: 24, opacity: 0, duration: 0.9 }, 0.25)
      .from('.hero-name-serif', { y: 90, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.out' }, 0.3)
      .from('.hero-name-outline', { y: 70, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.out' }, 0.45)
      .from('.hero-sub', { y: 34, opacity: 0, duration: 0.9 }, 0.7)
      .from('.hero-foot', { y: 24, opacity: 0, duration: 0.9 }, 0.85)
      .from('.v3-nav', { y: -26, opacity: 0, duration: 0.8 }, 0.4);

    // Generic chapter reveals
    gsap.utils.toArray('.rv').forEach((el) => {
      gsap.from(el, {
        y: 44, opacity: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Chapter 01 cards: staggered clip reveal
    gsap.set('.v3-card', { opacity: 0, y: 56, clipPath: 'inset(0 0 100% 0)' });
    ScrollTrigger.batch('.v3-card', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)',
        duration: 0.95, stagger: 0.13, ease: 'power3.out', overwrite: true,
        clearProps: 'clipPath'
      })
    });

    // Ghost numerals: slow drift against scroll
    gsap.utils.toArray('.ghost-num').forEach((el) => {
      gsap.fromTo(el, { y: 60 }, {
        y: -60, ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // Chapter 02: story lines activate one by one; meter fills with progress
    const lines = gsap.utils.toArray('.story-line');
    const meterFill = document.getElementById('story-meter-fill');
    let currentLine = 0;
    const setLine = (idx) => {
      if (idx === currentLine) return;
      currentLine = idx;
      lines.forEach((line, i) => line.classList.toggle('active', i === idx));
    };
    if (lines.length) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top 65%',
        end: 'bottom 60%',
        onUpdate: (self) => {
          setLine(Math.min(lines.length - 1, Math.floor(self.progress * lines.length)));
          if (meterFill) meterFill.style.transform = `scaleY(${self.progress.toFixed(4)})`;
        }
      });
    }

    // Footer band: gentle entrance
    gsap.from('.footer-band-track', {
      xPercent: 4, opacity: 0, duration: 1.2, ease: 'power3.out',
      scrollTrigger: { trigger: '.v3-footer', start: 'top 85%', once: true }
    });
  } else {
    // No GSAP or reduced motion: story starts on line 1, everything visible.
    const meterFill = document.getElementById('story-meter-fill');
    if (meterFill) meterFill.style.transform = 'scaleY(1)';
  }

  // =========================================================================
  // 5. NETLIFY FORM (same behaviour as production)
  // =========================================================================
  const bookingForm = document.getElementById('chair-form');
  const successBanner = document.getElementById('form-success');
  if (bookingForm && successBanner) {
    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const submitBtn = bookingForm.querySelector('.btn-reserve');
      submitBtn.innerHTML = '<span>Reserving Seat...</span>';
      submitBtn.disabled = true;
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(bookingForm)).toString()
      })
        .then((res) => { if (!res.ok) throw new Error(res.status); })
        .then(() => {
          bookingForm.style.display = 'none';
          successBanner.style.display = 'block';
          if (hasGSAP && !reduceMotion) {
            gsap.fromTo(successBanner, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
          }
        })
        .catch(() => {
          submitBtn.innerHTML = 'Something went wrong. Email connect.simanto@gmail.com';
          submitBtn.disabled = false;
        });
    });
  }

  if (isTouch) document.addEventListener('touchstart', () => {}, { passive: true });
});
