/**
 * SIMANTO MITRO — INTERACTIVE ENGINE
 * Canvas scroll film (193 frames: 1920x1080 desktop / 828x1840 portrait mobile, WebP)
 * GSAP + ScrollTrigger + Lenis. Respects prefers-reduced-motion.
 */
document.addEventListener('DOMContentLoaded', () => {
  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(pointer: coarse)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = window.innerWidth < 768;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));

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
  // 2. CANVAS SCROLL FILM
  //    Desktop: 1920x1080 landscape frames drawn "cover" (unchanged composition)
  //    Mobile:  dedicated 828x1840 portrait frames, pre-cropped around Simanto with the approved
  //             per-phase framing baked in (head clear in hero, mug clear in coffee moment), so the
  //             phone just draws them full-width — no runtime zoom/follow logic.
  // =========================================================================
  const TOTAL_FRAMES = 193;
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const footerEl = document.getElementById('footer-section');
  const DARK = '#060b18';
  const MOBILE_FRAME_W = 828;

  const ASSET_BASE = 'https://simanto101.github.io/Creative-Portfolio-Website/'; // LAB ONLY: frames stay in the original repo, untouched
  let frameDir = isMobile ? 'frames-mobile' : 'frames-desktop';
  const getFrameUrl = (n) => `${ASSET_BASE}${frameDir}/frame-${String(n).padStart(3, '0')}.webp`;

  let frameImages = new Array(TOTAL_FRAMES);
  let loadedIndices = new Set();
  let decodedIndices = new Set();
  const decodeQueue = [];
  let decodeBusy = 0;
  let loadToken = 0;
  let targetProgress = 0;
  let smoothProgress = 0;
  let smoothY = 0;

  function resizeCanvas() {
    if (!canvas) return;
    const mobileNow = window.innerWidth < 768;
    const wantDir = mobileNow ? 'frames-mobile' : 'frames-desktop';
    if (wantDir !== frameDir) { frameDir = wantDir; startLoading(); }
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    // Phones: never allocate a canvas bigger than the source frame (sharp + cheaper to fill)
    if (mobileNow) dpr = Math.min(dpr, MOBILE_FRAME_W / window.innerWidth);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    computeMobileKeys();
    render();
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('load', () => computeMobileKeys());

  // Progressive loading: frame 1 first (instant hero), then every 4th frame, then fill in.
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
      if (next >= milestoneCount && !fillAllowed) return; // wait; allowFill() restarts the pumps
      loadOne(order[next++], pump);
    };
    // Milestones start once the page has loaded (keeps the first paint / LCP path free)
    const startPumps = () => { for (let c = 0; c < CONCURRENCY; c++) pump(); };
    loadOne(0, () => {
      if (document.readyState === 'complete') startPumps();
      else window.addEventListener('load', startPumps, { once: true });
    });
  }
  startLoading();

  // Pre-decode frames BEFORE the scroll reaches them. drawImage of a WebP that
  // has only finished downloading (not decoding) forces a synchronous decode
  // on the draw path — that is the visible "stick" while scrolling. decode()
  // moves that work off the scroll path; nothing visual changes.
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
      if (!img || decodedIndices.has(idx)) continue; // not loaded yet; loadOne re-queues it
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

  // Desktop mapping (unchanged timing): global scroll progress -> frame
  function desktopFrameFromProgress(p) {
    const k = 65 / 96;
    const frac = p <= 0.42 ? (p / 0.42) * k : k + ((p - 0.42) / 0.58) * (1 - k);
    return frac * (TOTAL_FRAMES - 1);
  }

  // Mobile mapping: anchored to section positions (values in "story units" 0..95, scaled to 193 frames)
  let mobileKeys = [[0, 0], [1, 95]];
  function computeMobileKeys() {
    const vh = window.innerHeight;
    const topOf = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };
    const glance = topOf('#glance-section');
    const story = topOf('#story-section');
    const chairEl = document.getElementById('chair-section');
    const chair = topOf('#chair-section');
    const chairScroll = chairEl ? Math.max(1, chairEl.offsetHeight - vh) : vh;
    mobileKeys = [
      [0, 0],
      [glance * 0.35, 6],
      [glance, 34],
      [story, 56],
      [story + (chair - story) * 0.82, 82],
      [chair + chairScroll * 0.30, 88],
      [chair + chairScroll, 95]
    ];
  }
  function mobileFrameFromY(y) {
    const k = mobileKeys;
    let u = k[k.length - 1][1];
    if (y <= k[0][0]) u = k[0][1];
    else {
      for (let i = 1; i < k.length; i++) {
        if (y <= k[i][0]) {
          u = lerp(k[i - 1][1], k[i][1], (y - k[i - 1][0]) / Math.max(1, k[i][0] - k[i - 1][0]));
          break;
        }
      }
    }
    return u * (TOTAL_FRAMES - 1) / 95;
  }

  function drawDesktop(img, cw, ch) {
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const nw = Math.ceil(img.naturalWidth * scale);
    const nh = Math.ceil(img.naturalHeight * scale);
    ctx.drawImage(img, Math.floor((cw - nw) / 2), Math.floor((ch - nh) / 2), nw, nh);
  }

  function drawMobile(img, cw, ch) {
    // Portrait frame drawn full width, top aligned; its bottom already fades into #060b18
    const nh = Math.round(img.naturalHeight * (cw / img.naturalWidth));
    if (nh < ch) {
      ctx.fillStyle = DARK;
      ctx.fillRect(0, nh - 1, cw, ch - nh + 1);
    }
    ctx.drawImage(img, 0, 0, cw, nh);
  }

  let lastFade = -1;
  let lastDrawn = null;
  let lastSize = '';
  function render() {
    if (!ctx || !canvas) return;
    const mobileNow = window.innerWidth < 768;
    const exactFrame = mobileNow
      ? mobileFrameFromY(smoothY)
      : desktopFrameFromProgress(clamp01(smoothProgress));
    // Keep the next frames ahead of the playhead decoded and ready.
    const ahead = Math.round(exactFrame);
    for (let k = 10; k >= 1; k--) queueDecode(ahead + k, true);
    const img = getBestLoadedImage(exactFrame);
    if (img && img.complete && img.naturalWidth) {
      const size = canvas.width + 'x' + canvas.height;
      if (img !== lastDrawn || size !== lastSize) { // skip redundant draws (saves battery / GPU)
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (mobileNow) drawMobile(img, canvas.width, canvas.height);
        else drawDesktop(img, canvas.width, canvas.height);
        lastDrawn = img;
        lastSize = size;
      }
    }
    // Never show the zoomed video behind the footer
    let fade = 1;
    if (mobileNow && footerEl) {
      const ft = footerEl.getBoundingClientRect().top / window.innerHeight;
      fade = clamp01((ft - 0.25) / 0.6);
    } else if (!mobileNow) {
      const p = clamp01(smoothProgress);
      fade = p >= 0.86 ? Math.max(0, 1 - (p - 0.86) / 0.08) : 1;
    }
    fade = Math.round(fade * 100) / 100;
    if (fade !== lastFade) {
      canvas.style.opacity = String(fade);
      lastFade = fade;
    }
  }

  function readScroll() {
    const y = window.scrollY || document.documentElement.scrollTop;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targetProgress = y / max;
    handleNavMorph(targetProgress);
  }
  if (lenis) lenis.on('scroll', readScroll);
  else window.addEventListener('scroll', readScroll, { passive: true });

  function raf() {
    const lerpSpeed = reduceMotion ? 1 : (isTouch ? 0.15 : 0.10);
    smoothProgress += (targetProgress - smoothProgress) * lerpSpeed;
    const y = window.scrollY;
    smoothY += (y - smoothY) * lerpSpeed;
    if (Math.abs(y - smoothY) < 0.5) smoothY = y;
    render();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // =========================================================================
  // 3. NAVIGATION (desktop pill -> vertical left panel; mobile glass drawer)
  // =========================================================================
  const navWrapper = document.getElementById('nav-wrapper');
  function handleNavMorph(progress) {
    if (navWrapper) navWrapper.classList.toggle('morphed', progress > 0.08);
  }

  const burgerBtn = document.getElementById('mobile-burger');
  const mobileDrawer = document.getElementById('mobile-drawer');
  const drawerIsOpen = () => mobileDrawer && mobileDrawer.classList.contains('open');
  function openDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.add('open');
    mobileDrawer.setAttribute('aria-hidden', 'false');
    burgerBtn.classList.add('is-open');
    burgerBtn.setAttribute('aria-expanded', 'true');
    burgerBtn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
    if (lenis) lenis.stop();
  }
  function closeDrawer() {
    if (!mobileDrawer) return;
    mobileDrawer.classList.remove('open');
    mobileDrawer.setAttribute('aria-hidden', 'true');
    burgerBtn.classList.remove('is-open');
    burgerBtn.setAttribute('aria-expanded', 'false');
    burgerBtn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
    if (lenis) lenis.start();
  }
  if (burgerBtn && mobileDrawer) {
    burgerBtn.addEventListener('click', () => (drawerIsOpen() ? closeDrawer() : openDrawer()));
    mobileDrawer.addEventListener('click', (e) => { if (e.target === mobileDrawer) closeDrawer(); });
    mobileDrawer.querySelectorAll('a[target="_blank"], a[href^="mailto:"]').forEach((a) => a.addEventListener('click', closeDrawer));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerIsOpen()) closeDrawer(); });
  }

  // In-page anchors (smooth). Card anchors scroll to the At a Glance section and highlight that card.
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      let targetElement = document.querySelector(targetId);
      if (!targetElement) return;
      e.preventDefault();
      if (drawerIsOpen()) closeDrawer();
      let highlight = null;
      if (targetElement.classList.contains('deck-card')) {
        highlight = targetElement;
        targetElement = document.getElementById('glance-section');
      }
      const after = () => {
        if (!highlight) return;
        highlight.classList.remove('is-highlighted');
        void highlight.offsetWidth;
        highlight.classList.add('is-highlighted');
        setTimeout(() => highlight.classList.remove('is-highlighted'), 1800);
      };
      if (lenis) {
        lenis.scrollTo(targetElement, { offset: 0, duration: 1.4, onComplete: after });
      } else {
        targetElement.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        setTimeout(after, reduceMotion ? 0 : 900);
      }
    });
  });

  // =========================================================================
  // 5. GSAP ANIMATIONS
  // =========================================================================
  if (hasGSAP) {
    // ---- At a Glance: fan out from a stacked deck, then gentle float ----
    const cards = gsap.utils.toArray('.deck-card');
    if (cards.length) {
      const fan = [{ r: -7, y: 10 }, { r: -2.5, y: -6 }, { r: 2.5, y: -6 }, { r: 7, y: 10 }];
      if (reduceMotion) {
        gsap.set(cards, { opacity: 1 });
      } else {
        gsap.set(cards, { opacity: 0 });
        ScrollTrigger.create({
          trigger: '#glance-section',
          start: 'top 70%',
          once: true,
          onEnter: () => {
            if (isMobile) {
              gsap.fromTo(cards, { opacity: 0, y: 26, scale: 0.96 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out', clearProps: 'transform' });
            } else {
              const deck = document.querySelector('.cards-deck');
              const deckMid = deck.getBoundingClientRect().left + deck.offsetWidth / 2;
              gsap.fromTo(cards,
                {
                  opacity: 0, y: 70, rotation: 0, scale: 0.9,
                  x: (i, el) => deckMid - (el.getBoundingClientRect().left + el.offsetWidth / 2)
                },
                {
                  opacity: 1, x: 0, scale: 1,
                  y: (i) => fan[i % 4].y, rotation: (i) => fan[i % 4].r,
                  duration: 1.0, stagger: 0.07, ease: 'expo.out',
                  onComplete: () => {
                    gsap.set(cards, { clearProps: 'transform' });
                    cards.forEach((card) => card.classList.add('floating'));
                  }
                });
            }
          }
        });
      }
    }

    // ---- Story: one line at a time — masked rise + fade + blur clear; previous line fades out first ----
    const storyLines = document.querySelectorAll('.story-line');
    const storyContainer = document.querySelector('.story-lines-container');
    const progressIndicator = document.getElementById('story-indicator');
    let currentLine = -1;
    const setActiveLine = (activeIndex) => {
      if (activeIndex === currentLine) return;
      currentLine = activeIndex;
      storyLines.forEach((line, index) => {
        line.classList.toggle('active', index === activeIndex);
        line.classList.toggle('is-past', index < activeIndex);
      });
    };
    setActiveLine(0);

    if (storyLines.length && isMobile) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          setActiveLine(Math.floor(Math.min(0.999, p / 0.84) * storyLines.length));
          const out = p <= 0.86 ? 1 : Math.max(0, 1 - (p - 0.86) / 0.1);
          storyContainer.style.opacity = out.toFixed(3);
        },
        onLeave: () => { storyContainer.style.opacity = '0'; },
        onLeaveBack: () => { storyContainer.style.opacity = '1'; setActiveLine(0); }
      });
    } else if (storyLines.length) {
      ScrollTrigger.create({
        trigger: '#story-section',
        start: 'top 60%',
        end: 'bottom 40%',
        onLeave: () => { storyContainer.style.opacity = '0'; },
        onEnterBack: () => { storyContainer.style.opacity = ''; },
        onLeaveBack: () => { storyContainer.style.opacity = ''; setActiveLine(0); },
        onUpdate: (self) => {
          storyContainer.style.opacity = '';
          setActiveLine(Math.min(storyLines.length - 1, Math.floor(self.progress * storyLines.length)));
          if (progressIndicator) {
            progressIndicator.style.transform = `translateY(${self.progress * (380 - 380 * 0.25)}px)`;
          }
        }
      });
    }

    // ---- Pull Up a Chair: heading, then mug form, then fields stagger in ----
    const formFields = gsap.utils.toArray('.mug-header, #chair-form .glass-input, #chair-form .btn-reserve');
    if (isMobile) {
      if (!reduceMotion) {
        gsap.set('.chair-title, .chair-desc', { opacity: 0, y: 18 });
        gsap.set('.mug-form-wrapper', { opacity: 0, y: 40 });
        gsap.set(formFields, { opacity: 0, y: 12 });
      } else {
        gsap.set('.chair-title, .chair-desc', { opacity: 0 });
        gsap.set('.mug-form-wrapper', { opacity: 0 });
      }
      const chairTl = gsap.timeline({
        scrollTrigger: { trigger: '#chair-section', start: 'top top', end: 'bottom bottom', scrub: reduceMotion ? true : 0.4 }
      });
      chairTl
        .to({}, { duration: 0.30 }) // clean hold: Simanto + mug, no text
        .to('.chair-title, .chair-desc', { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' })
        .to('.mug-form-wrapper', { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' })
        .to(formFields, { opacity: 1, y: 0, duration: 0.12, stagger: 0.025, ease: 'power2.out' }, '-=0.08')
        .to({}, { duration: 0.12 });

      if (burgerBtn) {
        ScrollTrigger.create({
          trigger: '#chair-section',
          start: 'top 40%',
          endTrigger: '#footer-section',
          end: 'top 5%',
          toggleClass: { targets: burgerBtn, className: 'is-hidden' }
        });
      }
    } else if (!reduceMotion) {
      gsap.set(formFields, { opacity: 0, y: 14 });
      const deskChair = gsap.timeline({ scrollTrigger: { trigger: '#chair-section', start: 'top 75%' } });
      deskChair
        .fromTo('.chair-content', { opacity: 0, y: 35 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' })
        .to(formFields, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', clearProps: 'transform' }, 0.35);
    }

    // ---- Footer: soft staggered reveal ----
    if (!reduceMotion) {
      const footerTl = gsap.timeline({ scrollTrigger: { trigger: '#footer-section', start: 'top 85%' } });
      footerTl
        .fromTo('.footer-panel', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
        .fromTo('.footer-col', { opacity: 0, y: 18, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.1, ease: 'power3.out', clearProps: 'filter,transform' }, 0.15);
    }

    ScrollTrigger.addEventListener('refresh', computeMobileKeys);
  }

  // Hero intro runs entirely in CSS (starts on first paint, no JS needed). The per-letter spans are
  // kept afterwards: they render identically and re-painting the name would register a late LCP.

  // =========================================================================
  // 6. NETLIFY FORM
  // =========================================================================
  const bookingForm = document.getElementById('chair-form');
  const successBanner = document.getElementById('form-success');
  if (bookingForm && successBanner) {
    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const submitBtn = bookingForm.querySelector('.btn-reserve');
      submitBtn.innerHTML = '<span>Reserving Seat...</span>';
      submitBtn.style.opacity = '0.7';
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
          if (hasGSAP) gsap.fromTo(successBanner, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
        })
        .catch(() => {
          submitBtn.innerHTML = 'Something went wrong. Email connect.simanto@gmail.com';
          submitBtn.style.opacity = '1';
          submitBtn.disabled = false;
        });
    });
  }

  // =========================================================================
  // 7. DESKTOP POINTER EFFECTS: smoky cursor light, 3D card tilt + glare, magnetic CTAs
  // =========================================================================
  if (finePointer && !reduceMotion) {
    // Smoky cursor light: a sharp core + a slower, larger smoke layer, both lerped
    const core = document.getElementById('cursor-glow');
    let smoke = null;
    if (core) {
      smoke = document.createElement('div');
      smoke.id = 'cursor-smoke';
      smoke.setAttribute('aria-hidden', 'true');
      document.body.appendChild(smoke);
      let mx = -1000, my = -1000, cx = -1000, cy = -1000, sx = -1000, sy = -1000;
      let scale = 1, targetScale = 1, hot = 0, targetHot = 0;
      window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
      document.addEventListener('mouseover', (e) => {
        const t = e.target.closest('a, button, .deck-card, .glass-input, .glass-pill');
        targetScale = t ? 1.3 : 1;
        targetHot = t ? 1 : 0;
      });
      const t0 = performance.now();
      const loop = (now) => {
        cx += (mx - cx) * 0.16; cy += (my - cy) * 0.16;
        sx += (mx - sx) * 0.06; sy += (my - sy) * 0.06;
        scale += (targetScale - scale) * 0.12;
        hot += (targetHot - hot) * 0.12;
        const breathe = 1 + Math.sin((now - t0) / 1400) * 0.06;
        core.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${scale.toFixed(3)})`;
        core.style.setProperty('--hot', hot.toFixed(3));
        smoke.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(${(breathe * (1 + hot * 0.15)).toFixed(3)})`;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // 3D tilt + glare on cards
    document.querySelectorAll('.deck-card').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', `${((px - 0.5) * 14).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - py) * 12).toFixed(2)}deg`);
        card.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        card.classList.add('is-tilting');
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });

    // Magnetic CTA buttons
    if (hasGSAP) {
      document.querySelectorAll('.nav-cta, .btn-reserve, .footer-chair-btn').forEach((btn) => {
        const strength = btn.classList.contains('btn-reserve') ? 0.18 : 0.35;
        btn.addEventListener('mousemove', (e) => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - (r.left + r.width / 2)) * strength,
            y: (e.clientY - (r.top + r.height / 2)) * strength * 1.2,
            duration: 0.4, ease: 'power3.out'
          });
        });
        btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
      });
    }
  }

  // Mobile tap feedback (enables :active styles on iOS too)
  if (isTouch) {
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.querySelectorAll('.deck-card').forEach((card) => {
      card.addEventListener('touchstart', () => card.classList.add('is-pressed'), { passive: true });
      ['touchend', 'touchcancel'].forEach((ev) => card.addEventListener(ev, () => {
        setTimeout(() => card.classList.remove('is-pressed'), 160);
      }, { passive: true }));
    });
  }
});
