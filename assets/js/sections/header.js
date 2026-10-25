// Добавление фиксированной шапки при скролле
import { onReady } from '../base/init.js';

onReady(function () {
  const header = document.querySelector('.js-header');

  if (!header) return;

  // Создаем элемент-маркер
  const sentinel = document.createElement('div');
  sentinel.style.cssText =
    'position: absolute; height: 1px; width: 1px; top: 0; left: 0; opacity: 0; pointer-events: none;';

  // Вставляем маркер перед шапкой
  if (header.parentNode) {
    header.parentNode.insertBefore(sentinel, header);
  }

  // Создаем наблюдатель пересечений
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          // Маркер вышел за пределы экрана - добавляем класс fixed
          header.classList.add('fixed');
        } else {
          // Маркер виден - удаляем класс fixed
          header.classList.remove('fixed');
        }
      });
    },
    {
      threshold: 0,
      rootMargin: '0px',
    }
  );

  // Начинаем наблюдение за маркером
  observer.observe(sentinel);
});
