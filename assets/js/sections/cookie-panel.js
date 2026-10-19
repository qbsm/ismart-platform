// Панель согласия на cookie (proposal 0025). Решение хранит и исполняет consent-gate.twig
// (window.ismartConsent): «Принять» запускает отложенные счётчики, «Отклонить» — нет. Панель
// показывается, пока решения нет: отказ хранится полгода, согласие — год.
import { onReady } from '../base/init.js';

onReady(function () {
  const cookiePanel = document.querySelector('.cookie-panel');
  const acceptButton = document.querySelector('.js-cookie');
  const declineButton = document.querySelector('.js-cookie-decline');
  const consent = window.ismartConsent;

  if (!cookiePanel || !acceptButton || !consent) {
    return;
  }

  function showPanel() {
    cookiePanel.style.display = '';
    cookiePanel.classList.remove('hidden');
    cookiePanel.setAttribute('aria-hidden', 'false');
    cookiePanel.classList.add('opening');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cookiePanel.classList.remove('opening');
      });
    });
  }

  function hidePanel() {
    cookiePanel.classList.add('opening');

    setTimeout(() => {
      cookiePanel.classList.add('hidden');
      cookiePanel.classList.remove('opening');
      cookiePanel.setAttribute('aria-hidden', 'true');
    }, 300);
  }

  if (!consent.state()) {
    showPanel();
  }

  acceptButton.addEventListener('click', function (e) {
    e.preventDefault();
    consent.accept();
    hidePanel();
  });

  if (declineButton) {
    declineButton.addEventListener('click', function (e) {
      e.preventDefault();
      consent.decline();
      hidePanel();
    });
  }
});
