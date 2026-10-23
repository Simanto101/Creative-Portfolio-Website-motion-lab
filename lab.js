// ==========================================================================
// MOTION LAB (experiment copy only — the original site does not have this file)
// 1) Scroll progress hairline, driven by a passive scroll listener + rAF.
// 2) One-shot section reveals via IntersectionObserver.
// The hero film engine in main.js is untouched; this file only observes.
// ==========================================================================
(function () {
  document.documentElement.classList.add('lab-on');

  // --- Progress hairline ---
  var bar = document.getElementById('scroll-progress');
  var ticking = false;
  function updateBar() {
    if (!bar) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.scrollY / max));
    bar.style.transform = 'scaleX(' + p + ')';
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () { updateBar(); ticking = false; });
    }
  }, { passive: true });
  updateBar();

  // --- Section reveals ---
  var selector = [
    '#glance-section .glance-content',
    '#glance-section .deck-card',
    '#chair-section .chair-content',
    '#footer-section .footer-panel'
  ].join(',');
  var targets = Array.prototype.slice.call(document.querySelectorAll(selector));
  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach(function (el, i) {
    el.setAttribute('data-reveal', '');
    el.style.setProperty('--rd', (i % 4) * 0.08 + 's');
    io.observe(el);
  });
})();
