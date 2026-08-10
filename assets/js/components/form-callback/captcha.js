const SCRIPT_URL = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=__onSmartCaptcha';
const FIELD = 'smart-token';
const EXECUTE_TIMEOUT_MS = 8000;

let widgetId = null;
let ready = null;

const siteKey = () => (window.appConfig && window.appConfig.CAPTCHA_CLIENT_KEY) || '';

/**
 * Невидимый режим: человек капчу не видит, проверка показывается только подозрительной
 * сессии. Обычный виджет с картинками стоил бы конверсии на каждом посетителе, а спам идёт
 * единицами в сутки.
 */
function loadWidget() {
  if (ready) return ready;

  ready = new Promise((resolve) => {
    const container = document.createElement('div');
    container.id = 'smartcaptcha-container';
    container.style.display = 'none';
    document.body.appendChild(container);

    window.__onSmartCaptcha = () => {
      try {
        widgetId = window.smartCaptcha.render(container, {
          sitekey: siteKey(),
          invisible: true,
          hideShield: true,
        });
        resolve(true);
      } catch {
        resolve(false);
      }
    };

    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return ready;
}

export function initCaptcha() {
  if (!siteKey()) return;
  loadWidget();
}

/**
 * Ответ капчи для отправки. Пустая строка означает, что виджет не отработал — решение по
 * такой заявке принимает сервер, здесь отправку не блокируем.
 */
export async function captchaToken() {
  if (!siteKey()) return '';
  if (!(await loadWidget()) || widgetId === null) return '';

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), EXECUTE_TIMEOUT_MS);
    const finish = (value) => {
      clearTimeout(timer);
      resolve(value || '');
    };

    try {
      window.smartCaptcha.subscribe(widgetId, 'success', finish);
      window.smartCaptcha.subscribe(widgetId, 'javascript-error', () => finish(''));
      window.smartCaptcha.execute(widgetId);
    } catch {
      finish('');
    }
  });
}

export async function appendCaptchaToken(formData) {
  if (!siteKey()) return;
  const token = await captchaToken();
  if (token) formData.set(FIELD, token);
}
