const SCRIPT_URL = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=__onSmartCaptcha';
const FIELD = 'smart-token';
// Маркер вместо ответа капчи: домен сайта не значится в разрешённых, виджет отказался
// строиться. Сервер такую заявку пропускает — иначе неверная настройка в кабинете тихо
// отрезала бы все обращения.
export const HOST_ERROR = 'host-not-allowed';
// Столько ждём тихую проверку. Если капча показала картинку, ожидание снимается совсем:
// человек решает её десятки секунд, и обрывать его — значит отказать живому посетителю.
const SILENT_TIMEOUT_MS = 10000;
// Предел, который не снимается ничем. Даже если события капчи потерялись, форма обязана
// получить ответ и отправиться: подвисшая кнопка хуже пропущенного робота.
const HARD_LIMIT_MS = 60000;

let widgetId = null;
let ready = null;
let pendingResolve = null;
let hostRejected = false;

const siteKey = () => (window.appConfig && window.appConfig.CAPTCHA_CLIENT_KEY) || '';

/**
 * Невидимый режим: человек капчу не видит, проверка показывается только подозрительной
 * сессии. Обычный виджет с картинками стоил бы конверсии на каждом посетителе, а спам идёт
 * единицами в сутки.
 */
function loadWidget() {
  if (ready) return ready;

  ready = new Promise((resolve) => {
    // Контейнер не прячем: в display:none SmartCaptcha не инициализируется и не отдаёт токен.
    // В невидимом режиме она и так ничего не рисует, а «щит» отключён при рендере.
    const container = document.createElement('div');
    container.id = 'smartcaptcha-container';
    document.body.appendChild(container);

    window.addEventListener('error', (event) => {
      if (event.message && event.message.includes('cannot be used in the host')) {
        hostRejected = true;
        if (pendingResolve) {
          pendingResolve(HOST_ERROR);
          pendingResolve = null;
        }
      }
    });

    window.__onSmartCaptcha = () => {
      try {
        widgetId = window.smartCaptcha.render(container, {
          sitekey: siteKey(),
          invisible: true,
          hideShield: true,
          callback: (token) => {
            if (pendingResolve) {
              pendingResolve(token || '');
              pendingResolve = null;
            }
          },
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
  if (!(await loadWidget()) || widgetId === null) return hostRejected ? HOST_ERROR : '';
  if (hostRejected) return HOST_ERROR;

  return new Promise((resolve) => {
    let timer = setTimeout(() => finish(''), SILENT_TIMEOUT_MS);
    const hard = setTimeout(() => finish(''), HARD_LIMIT_MS);

    function finish(token) {
      clearTimeout(timer);
      clearTimeout(hard);
      pendingResolve = null;
      resolve(token || '');
    }

    pendingResolve = finish;

    try {
      // Картинка на экране — ждём человека сколько понадобится; закрыл окно, не решив, —
      // отпускаем отправку, решение примет сервер.
      window.smartCaptcha.subscribe(widgetId, 'challenge-visible', () => clearTimeout(timer));
      window.smartCaptcha.subscribe(widgetId, 'challenge-hidden', () => {
        timer = setTimeout(() => finish(''), 1500);
      });
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
