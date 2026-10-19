// JavaScript для accordion (управление через классы, без inline-стилей)
import { onReady } from '../base/init.js';

onReady(function () {
  const accordions = document.querySelectorAll('.accordion');

  accordions.forEach((accordion) => {
    const items = accordion.querySelectorAll('.accordion__item.question-wrap');
    const showAllItem = accordion.querySelector('.accordion__item.show-all');
    const showAllButton = showAllItem ? showAllItem.querySelector('.accordion__show-all') : null;
    const initialItemsCount = 10;

    if (items.length > initialItemsCount) {
      items.forEach((item, index) => {
        if (index >= initialItemsCount) {
          item.classList.add('hidden');
        }
      });
      if (showAllButton) {
        showAllButton.addEventListener('click', function (e) {
          e.preventDefault();
          items.forEach((item) => item.classList.remove('hidden'));
          if (showAllItem) showAllItem.classList.add('hidden');
        });
      }
    } else if (showAllItem) {
      showAllItem.classList.add('hidden');
    }

    items.forEach((item) => {
      const trigger = item.querySelector('button.title-wrap');
      const descWrap = item.querySelector('.desc-wrap');
      if (!trigger || !descWrap) return;

      item.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', () => {
        const isActive = item.classList.contains('active');

        items.forEach((otherItem) => {
          if (otherItem !== item) {
            const otherTrigger = otherItem.querySelector('button.title-wrap');
            otherItem.classList.remove('active');
            if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
          }
        });

        if (!isActive) {
          item.classList.add('active');
          trigger.setAttribute('aria-expanded', 'true');
        } else {
          item.classList.remove('active');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    });
  });
});
