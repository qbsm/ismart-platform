// Обработка клика по иконке бургера
import { onReady } from '../base/init.js';

onReady(function () {
  const burgerIcon = document.getElementById('burgerIcon');
  let scrollPosition = 0;

  if (burgerIcon) {
    burgerIcon.addEventListener('click', function () {
      const burgerMenu = document.getElementById('burgerMenu');
      const isOpen = this.classList.toggle('active');

      this.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      this.setAttribute(
        'aria-label',
        isOpen ? this.dataset.labelClose || 'Close menu' : this.dataset.labelOpen || 'Open menu'
      );

      if (burgerMenu) {
        burgerMenu.classList.toggle('active');
        burgerMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

        if (isOpen) {
          scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
          document.body.style.overflow = 'hidden';
          document.body.style.position = 'fixed';
          document.body.style.top = `-${scrollPosition}px`;
          document.body.style.width = '100%';
        } else {
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, scrollPosition);
        }
      }
    });
  }

  // Обработка клика по меню
  const burgerMenu = document.getElementById('burgerMenu');
  if (burgerMenu) {
    burgerMenu.addEventListener('click', function (e) {
      // Не закрываем меню при клике на сам контейнер меню, но не блокируем ссылки
      if (e.target === burgerMenu || e.target.classList.contains('container')) {
        e.stopPropagation();
      }
    });
  }

  // Закрытие меню при клике на пункты меню
  const menuItems = document.querySelectorAll('#burgerMenu a');
  if (menuItems.length > 0) {
    menuItems.forEach((item) => {
      item.addEventListener('click', function () {
        if (burgerIcon) {
          burgerIcon.classList.remove('active');
          burgerIcon.setAttribute('aria-expanded', 'false');
          burgerIcon.setAttribute('aria-label', burgerIcon.dataset.labelOpen || 'Open menu');
        }
        if (burgerMenu) {
          burgerMenu.classList.remove('active');
          burgerMenu.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, scrollPosition);
        }
      });
    });
  }

  // Закрытие меню при клике вне меню
  document.addEventListener('click', function (e) {
    if (burgerIcon && burgerMenu) {
      if (!burgerIcon.contains(e.target) && !burgerMenu.contains(e.target)) {
        burgerIcon.classList.remove('active');
        burgerIcon.setAttribute('aria-expanded', 'false');
        burgerIcon.setAttribute('aria-label', burgerIcon.dataset.labelOpen || 'Open menu');
        burgerMenu.classList.remove('active');
        burgerMenu.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollPosition);
      }
    }
  });
});
