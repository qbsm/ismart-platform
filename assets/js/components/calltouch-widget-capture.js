/*
 * Копия контакта из виджета обратного звонка CallTouch.
 *
 * Виджет постит заявку напрямую в CallTouch, минуя наш бэкенд: в базе заявок и в аналитике
 * этих обращений нет вовсе. Здесь мы снимаем номер, который человек ввёл в поле виджета, и шлём
 * копию на свой эндпоинт — звонок при этом инициирует сам виджет, мы в его работу не лезем.
 *
 * Виджет рисуется в iframe без src (about:blank), то есть same-origin: его документ доступен.
 * Слушаем в capture-фазе, чтобы событие дошло до нас раньше обработчиков SDK и мы успели
 * прочитать поле до того, как виджет его очистит.
 *
 * Селекторы SDK намеренно не завязаны на имена классов — они собраны с хэшами
 * (styles__SingleButton-sc-1a0aa892-0) и меняются с каждой их сборкой. Ищем поле по типу и
 * содержимому, а отправку ловим по любому клику или Enter внутри виджета.
 */

const ENDPOINT = 'api/widget-rescue';
const MIN_DIGITS = 10;
const RESCAN_MS = 2000;

const digits = (value) => (value || '').replace(/\D+/g, '');

const phoneField = (doc) => {
  const inputs = [...doc.querySelectorAll('input')];
  return inputs.find((i) => /тел|phone/i.test(`${i.placeholder} ${i.name} ${i.type}`)) || inputs[0] || null;
};

const cookie = (name) => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
};

const utm = () => {
  const out = {};
  const params = new URLSearchParams(window.location.search);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
    const value = params.get(key) || sessionStorage.getItem(key);
    if (value) out[key] = value;
  });
  return out;
};

const sent = new Set();

async function send(phone) {
  const key = digits(phone);
  // Один и тот же номер шлём один раз: клик и Enter приходят парой, да и человек нередко
  // жмёт кнопку дважды.
  if (sent.has(key)) return;
  sent.add(key);

  const body = new FormData();
  body.set('csrf_token', (window.appConfig && window.appConfig.csrfToken) || '');
  body.set('phone', phone);
  body.set('page_url', window.location.href);
  body.set('referrer', document.referrer || '');
  Object.entries(utm()).forEach(([k, v]) => body.set(k, v));
  const ctSession = cookie('_ct_session_id');
  if (ctSession) body.set('ct_session_id', ctSession);
  const ymUid = cookie('_ym_uid');
  if (ymUid) body.set('ym_uid', ymUid);

  const base = (window.appConfig && window.appConfig.baseUrl) || '/';
  try {
    await fetch(base.replace(/\/?$/, '/') + ENDPOINT, { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    // Молча: копия — дополнение к работе виджета, её отказ не должен ничего ломать у клиента.
    sent.delete(key);
  }
}

function attach(doc) {
  if (doc.__ctCaptureAttached) return;
  doc.__ctCaptureAttached = true;

  const grab = () => {
    const field = phoneField(doc);
    if (field && digits(field.value).length >= MIN_DIGITS) send(field.value);
  };

  doc.addEventListener('click', grab, true);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Enter') grab(); }, true);
  // Виджет закрывается после отправки — забираем номер и на этом переходе.
  doc.addEventListener('submit', grab, true);
}

function scan() {
  [...document.querySelectorAll('iframe')].forEach((frame) => {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return; // чужой origin — не наш случай, виджет CallTouch рисуется в about:blank
    }
    if (doc && phoneField(doc)) attach(doc);
  });
}

export function initCalltouchWidgetCapture() {
  if (!window.appConfig || !window.appConfig.csrfToken) return;
  scan();
  // Виджет появляется асинхронно и пересобирает свой DOM при каждом открытии.
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, RESCAN_MS);
}
