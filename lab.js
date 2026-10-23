// ==========================================================================
// MOTION LAB (experiment copy only — the original site does not have this file)
// v1: scroll progress hairline + one-shot section reveals.
// v2 (bold): hero watermark parallax, slam reveals for headings,
//            3D tilt + pointer shine on deck cards.
// The hero film engine in main.js is untouched; this file only observes.
// ==========================================================================
(function () {
  document.documentElement.classList.add('lab-on');

  var wmTrack = document.querySelector('.lab-watermark-track');

  // --- Progress hairline + watermark drift (one passive scroll listener) ---
  var bar = document.getElementById('scroll-progress');
  var ticking = false;
  function updateOnScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.scrollY / max));
    if (bar) bar.style.transform = 'scaleX(' + p + ')';
    if (wmTrack && window.scrollY < window.innerHeight * 1.4) {
      wmTrack.style.transform = 'translateX(' + (-window.scrollY * 0.12) + 'px)';
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function () { updateOnScroll(); ticking = false; });
    }
  }, { passive: true });
  updateOnScroll();

  // --- Reveals: soft rise for blocks, slam for headings ---
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
  }
  function arm(selector, type) {
    document.querySelectorAll(selector).forEach(function (el, i) {
      el.setAttribute('data-reveal', type);
      el.style.setProperty('--rd', (i % 4) * 0.08 + 's');
      if (io) io.observe(el); else el.classList.add('in');
    });
  }
  arm([
    '#glance-section .glance-content',
    '#glance-section .deck-card',
    '#chair-section .chair-content',
    '#footer-section .footer-panel'
  ].join(','), '');
  arm([
    '#glance-section h2',
    '#chair-section .chair-title',
    '#footer-section .footer-heading'
  ].join(','), 'slam');

  // --- Deck cards: 3D tilt + shine position (fine pointers only) ---
  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.deck-card').forEach(function (card) {
      // Enable tilt only after the reveal transition has finished.
      setTimeout(function () { card.classList.add('lab-tilt'); }, 1000);
      card.addEventListener('mousemove', function (ev) {
        var r = card.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width;
        var py = (ev.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100) + '%');
        card.style.setProperty('--my', (py * 100) + '%');
        if (card.classList.contains('lab-tilt')) {
          card.style.transform =
            'perspective(900px) rotateX(' + ((0.5 - py) * 7) + 'deg)' +
            ' rotateY(' + ((px - 0.5) * 9) + 'deg)';
        }
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }
})();
