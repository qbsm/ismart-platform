import { onReady } from '../base/init.js';

onReady(function () {
  const headline = document.querySelector('.headline');
  if (!headline) return;

  const target = headline.querySelector('.section__item.heading-wrap');
  if (!target) return;

  function updatePosition(x, y) {
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--mouse-x', x - rect.left + 'px');
    target.style.setProperty('--mouse-y', y - rect.top + 'px');
  }

  function resetPosition() {
    target.style.setProperty('--mouse-x', '-100px');
    target.style.setProperty('--mouse-y', '-100px');
  }

  target.addEventListener('mousemove', function (e) {
    updatePosition(e.clientX, e.clientY);
  });

  target.addEventListener('mouseleave', resetPosition);

  target.addEventListener('touchmove', function (e) {
    const touch = e.touches[0];
    updatePosition(touch.clientX, touch.clientY);
  });

  target.addEventListener('touchend', resetPosition);
});
