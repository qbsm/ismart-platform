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

// Ответ капчи живёт около пяти минут; опоздавший берём, пока он заведомо свежий.
const LATE_TOKEN_TTL_MS = 120000;

let widgetId = null;
let ready = null;
let pendingResolve = null;
let hostRejected = false;
// Ответ пришёл, когда форма уже перестала ждать: картинка на VPN или долго открытой вкладке
// появляется и через 20 с. Такой ответ не выбрасываем — им отправляется заявка.
let lateToken = null;
let onLate = null;
// Как прошла последняя проверка — в хронологию попытки приёмнику (timing у исхода):
// how — silent (ответ без картинки), challenge (картинку решили), closed (закрыли не решив),
// timeout (ни ответа, ни картинки), late (взят опоздавший ответ), host, off; ms — сколько ждали.
let last = { how: 'off', ms: 0 };
const now = () => (window.performance && performance.now ? performance.now() : Date.now());

export function lastCaptcha() {
  return last;
}

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
          // Язык задания — как у страницы: без него SmartCaptcha выбирает по браузеру, и выходило по-английски.
          hl: (document.documentElement.lang || 'ru').slice(0, 2),
          invisible: true,
          hideShield: true,
          callback: (token) => {
            if (pendingResolve) {
              pendingResolve(token || '');
              pendingResolve = null;
              return;
            }
            if (!token) return;
            lateToken = { token, at: Date.now() };
            const notify = onLate;
            onLate = null;
            if (notify) notify();
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
 *
 * fresh: сервер ответ не принял (CAPTCHA_INVALID) — виджет сбрасывается и проверка проходит
 * заново. Тихое ожидание тогда дольше: подозрительной сессии капча показывает картинку не
 * сразу, а иногда через десяток секунд, и человек уже решает её — обрывать его нельзя.
 */
export async function captchaToken({ fresh = false, late = null } = {}) {
  const started = now();
  last = { how: 'off', ms: 0 };
  if (!siteKey()) return '';
  if (!(await loadWidget()) || widgetId === null) {
    last = { how: hostRejected ? 'host' : 'nowidget', ms: Math.round(now() - started) };
    return hostRejected ? HOST_ERROR : '';
  }
  if (hostRejected) {
    last = { how: 'host', ms: 0 };
    return HOST_ERROR;
  }

  // Опоздавший ответ прошлой проверки — сразу в дело: человек картинку уже решил.
  const kept = lateToken;
  lateToken = null;
  if (kept && Date.now() - kept.at < LATE_TOKEN_TTL_MS) {
    last = { how: 'late', ms: 0 };
    return kept.token;
  }
  // Кого позвать, если ответ этой проверки опоздает: последняя отправившая форма.
  onLate = late;

  return new Promise((resolve) => {
    const silentMs = fresh ? SILENT_TIMEOUT_MS * 3 : SILENT_TIMEOUT_MS;
    const unsubscribe = [];
    let done = false;
    let shown = false;
    let timer = setTimeout(() => finish(''), silentMs);
    const hard = setTimeout(() => finish(''), HARD_LIMIT_MS);

    function finish(token) {
      if (done) return;
      done = true;
      let how = shown ? 'closed' : 'timeout';
      if (token) how = shown ? 'challenge' : 'silent';
      last = { how: fresh ? `${how}-fresh` : how, ms: Math.round(now() - started) };
      clearTimeout(timer);
      clearTimeout(hard);
      // Подписки снимаются: оставшись от прошлой отправки, «challenge-hidden» обнулил бы
      // ожидание следующей.
      unsubscribe.forEach((off) => {
        try {
          off();
        } catch {
          // виджет уже уничтожен
        }
      });
      if (pendingResolve === finish) pendingResolve = null;
      resolve(token || '');
    }

    pendingResolve = finish;

    try {
      if (fresh) window.smartCaptcha.reset(widgetId);
      // Картинка на экране — ждём человека сколько понадобится; закрыл окно, не решив, —
      // отпускаем отправку, решение примет сервер.
      const on = (event, handler) => {
        const off = window.smartCaptcha.subscribe(widgetId, event, handler);
        if (typeof off === 'function') unsubscribe.push(off);
      };
      on('challenge-visible', () => {
        shown = true;
        clearTimeout(timer);
      });
      on('challenge-hidden', () => {
        clearTimeout(timer);
        timer = setTimeout(() => finish(''), 1500);
      });
      window.smartCaptcha.execute(widgetId);
    } catch {
      finish('');
    }
  });
}

/**
 * Окно проверки на экране (задание или его загрузка): через VPN оно грузится десятки секунд, и
 * форма успевает сдаться. Тогда вместо ошибки — просьба пройти проверку: ответ отправит заявку сам.
 */
export function captchaOnScreen() {
  const frames = document.querySelectorAll('iframe[src*="smartcaptcha"]');
  for (let i = 0; i < frames.length; i++) {
    const r = frames[i].getBoundingClientRect();
    if (r.width > 100 && r.height > 100 && getComputedStyle(frames[i]).visibility !== 'hidden') return true;
  }
  return false;
}

/** Ответ капчи пришёл, пока заявка ещё уходила (и ушла неудачно), — его можно пустить в дело. */
export function hasLateCaptchaToken() {
  return Boolean(lateToken && Date.now() - lateToken.at < LATE_TOKEN_TTL_MS);
}

export async function appendCaptchaToken(formData, { late = null } = {}) {
  if (!siteKey()) return;
  const token = await captchaToken({ late });
  if (token) formData.set(FIELD, token);
}
