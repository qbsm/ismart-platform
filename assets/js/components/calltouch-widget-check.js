// Копия контакта из виджета — docs.ismart.pro/api.ismart.pro.

import { appendTrigger, leadTrigger } from './lead-context.js';
import { fetchFormToken } from './form-callback/token.js';

import { funnelStep } from './funnel.js';

const ENDPOINT = 'api/widget-rescue';
const HEALTH_MAX_MS = 60000;
const HEALTH_STEP_MS = 500;
const AUTO_OPEN_SEC = 5;
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
  if (sent.has(key)) return;
  sent.add(key);

  const body = new FormData();
  const formToken = await fetchFormToken();
  if (formToken) body.set('form_token', formToken);
  body.set('phone', phone);
  body.set('page_url', window.location.href);
  body.set('referrer', document.referrer || '');
  Object.entries(utm()).forEach(([k, v]) => body.set(k, v));
  const ctSession = cookie('_ct_session_id');
  if (ctSession) body.set('ct_session_id', ctSession);
  const ymUid = cookie('_ym_uid');
  if (ymUid) body.set('ym_uid', ymUid);
  appendTrigger(body);
  // Виджет всплывает и сам, по таймеру. Без пометки пустой контекст неотличим от «не собрали»,
  // а это разные вещи: у показа по таймеру и у клика по кнопке разная конверсия.
  const trigger = leadTrigger();
  body.set('open_type', trigger && trigger.age <= AUTO_OPEN_SEC ? 'click' : 'auto');

  const base = (window.appConfig && window.appConfig.baseUrl) || '/';
  try {
    await fetch(base.replace(/\/?$/, '/') + ENDPOINT, { method: 'POST', body, credentials: 'same-origin' });
  } catch {
    sent.delete(key);
  }
}

function attach(doc) {
  if (doc.__ctChecked) return;
  doc.__ctChecked = true;

  const grab = () => {
    const field = phoneField(doc);
    if (field && digits(field.value).length >= MIN_DIGITS) send(field.value);
  };

  doc.addEventListener('click', grab, true);
  doc.addEventListener('keydown', (e) => { if (e.key === 'Enter') grab(); }, true);
  doc.addEventListener('submit', grab, true);
}

function scan() {
  [...document.querySelectorAll('iframe')].forEach((frame) => {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    if (doc && phoneField(doc)) attach(doc);
  });
}

const hasSdk = () => typeof window.ct === 'function' || !!window.CalltouchDataObject;

// Готовность виджета — по скрипту, который CallTouch подгружает, когда виджет привязан к
// счётчику. Прежняя проверка искала iframe с полями внутри, но форма виджета рисуется только
// при открытии: на странице, где виджет исправен, её нет, и почти каждый визит уходил в
// ct_nowidget. Спрашивать сам CallTouch через openExternal нельзя — этот вызов открывает
// форму посетителю.
const widgetReady = () => !!document.querySelector('script[src*="init-widget.js"]');

/**
 * Ждём готовности до минуты и сообщаем момент, когда она наступила: `t` в событии — это
 * секунды с начала визита, то есть сразу видно не только «поднялся ли виджет», но и через
 * сколько. Фиксированный порог в 10 секунд отвечал на этот вопрос неверно — виджет нередко
 * готов позже, особенно на мобильных.
 */
function watchWidgetHealth() {
  const startedAt = Date.now();

  const timer = setInterval(() => {
    if (widgetReady()) {
      clearInterval(timer);
      funnelStep('ct_ready', 'widget');
      return;
    }

    if (Date.now() - startedAt >= HEALTH_MAX_MS) {
      clearInterval(timer);
      funnelStep(hasSdk() ? 'ct_nowidget' : 'ct_missing', 'widget');
    }
  }, HEALTH_STEP_MS);
}

export function initCalltouchWidgetCheck() {
  watchWidgetHealth();
  // Токен берём заранее: виджет всплывает через десятки секунд, и к моменту перехвата у
  // токена уже есть возраст — иначе отправка выглядела бы мгновенной, как у робота.
  fetchFormToken();
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, RESCAN_MS);
}
