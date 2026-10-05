// Обработка клика по иконке бургера
import { onReady } from '../base/init.js';

onReady(function () {
  const burgerIcon = document.getElementById('burgerIcon');
  const burgerMenu = document.getElementById('burgerMenu');

  // Блокировка фона — overflow на html. Прежний вариант (body: fixed +
  // top: -scrollY + scrollTo при закрытии) рассчитывал на то, что скролл-контейнер —
  // body: при документ-скроллере он сдвигал страницу и уносил из вида липкую шапку,
  // а сохранённая позиция сбрасывала скролл в начало.
  function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? 'hidden' : '';
  }

  function setMenuState(isOpen) {
    if (burgerIcon) {
      burgerIcon.classList.toggle('active', isOpen);
      burgerIcon.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      burgerIcon.setAttribute(
        'aria-label',
        isOpen ? burgerIcon.dataset.labelClose || 'Close menu' : burgerIcon.dataset.labelOpen || 'Open menu'
      );
    }

    if (burgerMenu) {
      burgerMenu.classList.toggle('active', isOpen);
      burgerMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }

    lockScroll(isOpen);
  }

  if (burgerIcon) {
    burgerIcon.addEventListener('click', function () {
      setMenuState(!this.classList.contains('active'));
    });
  }

  if (burgerMenu) {
    burgerMenu.addEventListener('click', function (e) {
      // Не закрываем меню при клике на сам контейнер меню, но не блокируем ссылки
      if (e.target === burgerMenu || e.target.classList.contains('container')) {
        e.stopPropagation();
      }
    });

    burgerMenu.querySelectorAll('a').forEach((item) => {
      item.addEventListener('click', function () {
        setMenuState(false);
      });
    });
  }

  // Закрытие меню при клике вне меню — только когда оно открыто
  document.addEventListener('click', function (e) {
    if (!burgerIcon || !burgerMenu || !burgerMenu.classList.contains('active')) {
      return;
    }

    if (!burgerIcon.contains(e.target) && !burgerMenu.contains(e.target)) {
      setMenuState(false);
    }
  });
});
