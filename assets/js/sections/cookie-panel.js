// JavaScript для cookie-panel
import { onReady } from '../base/init.js';

onReady(function () {
  const cookiePanel = document.querySelector('.cookie-panel');
  const acceptButton = document.querySelector('.js-cookie');

  if (!cookiePanel || !acceptButton) {
    return;
  }

  // Функция для работы с cookies
  const cookieUtils = {
    // Установить cookie
    set: function (name, value, days) {
      const expires = new Date();
      expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    },

    // Получить cookie
    get: function (name) {
      const nameEQ = name + '=';
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
    },

    // Проверить существование cookie
    exists: function (name) {
      return this.get(name) !== null;
    },
  };

  // Функция показа панели
  function showPanel() {
    cookiePanel.style.display = '';
    cookiePanel.classList.remove('hidden');
    cookiePanel.setAttribute('aria-hidden', 'false');
    cookiePanel.classList.add('opening');

    // Анимация появления
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cookiePanel.classList.remove('opening');
      });
    });
  }

  // Функция скрытия панели
  function hidePanel() {
    cookiePanel.classList.add('opening');

    setTimeout(() => {
      cookiePanel.classList.add('hidden');
      cookiePanel.classList.remove('opening');
      cookiePanel.setAttribute('aria-hidden', 'true');
    }, 300);
  }

  // Проверяем, есть ли уже согласие
  if (cookieUtils.exists('cookie_consent')) {
    // Согласие уже дано — панель остаётся с классом hidden
  } else {
    showPanel();
  }

  // Обработчик клика на кнопку "Принимаю"
  acceptButton.addEventListener('click', function (e) {
    e.preventDefault();

    // Устанавливаем cookie на 60 дней
    cookieUtils.set('cookie_consent', 'accepted', 60);

    // Скрываем панель
    hidePanel();

    // Сообщаем системе, что пользователь дал согласие (для отложенной загрузки аналитики)
    try {
      const event = new CustomEvent('cookieConsentAccepted', { detail: { source: 'cookie-panel', ts: Date.now() } });
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    } catch {
      /* ignore */
    }
  });
});
