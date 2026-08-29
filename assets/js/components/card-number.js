import { onReady } from '../base/init.js';

onReady(() => {
  const cards = document.querySelectorAll('.card-number__item.title-wrap');
  if (!cards.length) return;

  cards.forEach((card) => {
    const titleEl = card.querySelector('.card-number__title');
    if (!titleEl) return;

    const labelWrap = card.parentElement.querySelector('.card-number__item.label-wrap');

    const raw = titleEl.textContent.trim();
    const hasSuffix = raw.endsWith('+');
    const target = parseInt(raw.replace(/\D/g, ''), 10);
    if (isNaN(target)) return;

    const duration = parseFloat(card.dataset.time || '1') * 1000;

    titleEl.textContent = '0';

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(card);
          animateCount(titleEl, target, duration, hasSuffix, labelWrap);
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(card);
  });

  function animateCount(el, target, duration, hasSuffix, labelWrap) {
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      el.textContent = current + (progress >= 1 && hasSuffix ? '+' : '');

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else if (labelWrap) {
        labelWrap.classList.add('visible');
      }
    }

    requestAnimationFrame(tick);
  }
});
