// Копия контакта из виджета — docs.ismart.pro/api.ismart.pro.

import { appendTrigger } from './lead-context.js';

import { funnelStep } from './funnel.js';

const ENDPOINT = 'api/widget-rescue';
const HEALTH_DELAY_MS = 10000;
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
  body.set('csrf_token', (window.appConfig && window.appConfig.csrfToken) || '');
  body.set('phone', phone);
  body.set('page_url', window.location.href);
  body.set('referrer', document.referrer || '');
  Object.entries(utm()).forEach(([k, v]) => body.set(k, v));
  const ctSession = cookie('_ct_session_id');
  if (ctSession) body.set('ct_session_id', ctSession);
  const ymUid = cookie('_ym_uid');
  if (ymUid) body.set('ym_uid', ymUid);
  appendTrigger(body);

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

function reportHealth() {
  const hasSdk = typeof window.ct === 'function' || !!window.CalltouchDataObject;
  const hasWidget = [...document.querySelectorAll('iframe')].some((f) => {
    try {
      return !!(f.contentDocument && f.contentDocument.querySelector('input, button'));
    } catch {
      return false;
    }
  });

  if (hasSdk && hasWidget) funnelStep('ct_ready', 'widget');
  else if (hasSdk) funnelStep('ct_nowidget', 'widget');
  else funnelStep('ct_missing', 'widget');
}

export function initCalltouchWidgetCheck() {
  setTimeout(reportHealth, HEALTH_DELAY_MS);
  if (!window.appConfig || !window.appConfig.csrfToken) return;
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, RESCAN_MS);
}
