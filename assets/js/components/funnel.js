// Воронка заявки — docs.ismart.pro/api.ismart.pro, раздел «Аналитика конверсии».

const SENT_KEY = 'fn_state';
const STEPS = {
  seen: 'seen',
  modal: 'modal',
  open: 'open',
  input: 'input',
  abandon: 'abandon',
  submit: 'submit',
  ct_ready: 'ct_ready',
  ct_nowidget: 'ct_nowidget',
  ct_missing: 'ct_missing',
};

const startedAt = Date.now();
let inputStarted = false;
let submitted = false;
let widgetTouched = false;

const sinceStart = () => Math.round((Date.now() - startedAt) / 1000);

function alreadySent(step) {
  try {
    const sent = JSON.parse(sessionStorage.getItem(SENT_KEY) || '[]');
    if (sent.includes(step)) return true;
    sent.push(step);
    sessionStorage.setItem(SENT_KEY, JSON.stringify(sent));
    return false;
  } catch {
    return false;
  }
}

export function funnelStep(step, channel = 'form', where = '') {
  if (!step || alreadySent(`${channel}:${step}`)) return;
  const params = new URLSearchParams({ s: step, c: channel, t: String(sinceStart()) });
  if (where) params.set('w', where.slice(0, 40));
  const url = `/_f?${params.toString()}`;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else new Image().src = url;
  } catch {
    return;
  }
}

function sectionOf(el) {
  const section = el && el.closest ? el.closest('section, [data-section], .section') : null;
  if (!section) return '';
  return (section.dataset.section || section.id || section.className.split(' ')[0] || '').slice(0, 40);
}

function watchVisibility() {
  const targets = [...document.querySelectorAll('form, .form-callback, [data-form]')];
  if (!targets.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          funnelStep(STEPS.seen, 'form', sectionOf(e.target));
          io.disconnect();
          return;
        }
      }
    },
    { threshold: 0.3 }
  );
  targets.forEach((t) => io.observe(t));
}

/**
 * Открытие нашей формы. Раньше воронка начиналась с фокуса в поле (`open`), и по данным
 * выходило, что за неделю форму трогают три человека из пятнадцати тысяч, — цифра, которой
 * не бывает. Причина простая: шага «форму открыли» не было вовсе, и мы не знали, доходят ли
 * люди до неё вообще. Теперь ловим появление видимой модалки с полем ввода.
 */
function watchModal() {
  const counted = new WeakSet();
  const check = () => {
    for (const m of document.querySelectorAll('[class*="modal"], [class*="popup"]')) {
      if (counted.has(m)) continue;
      const cs = getComputedStyle(m);
      const r = m.getBoundingClientRect();
      const visible =
        cs.display !== 'none' &&
        cs.visibility !== 'hidden' &&
        Number(cs.opacity) > 0.1 &&
        r.width > 100 &&
        r.height > 100;
      if (!visible || !m.querySelector('input')) continue;
      counted.add(m);
      funnelStep(STEPS.modal, 'form', (m.id || m.className || '').slice(0, 40));
    }
  };
  // Модалку открывает клик, поэтому проверяем после него; интервал — страховка на случай
  // открытия по таймеру или из чужого скрипта.
  document.addEventListener('click', () => setTimeout(check, 400), true);
  setInterval(check, 3000);
}

function watchForms() {
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target;
      if (!el.matches || !el.matches('input, textarea, select')) return;
      if (el.type === 'hidden') return;
      funnelStep(STEPS.open, 'form', sectionOf(el));
    },
    true
  );

  document.addEventListener(
    'input',
    () => {
      inputStarted = true;
      funnelStep(STEPS.input, 'form');
    },
    true
  );

  document.addEventListener(
    'submit',
    () => {
      submitted = true;
      funnelStep(STEPS.submit, 'form');
    },
    true
  );
}

function watchWidget() {
  const seen = new WeakSet();
  const scan = () => {
    for (const frame of document.querySelectorAll('iframe')) {
      let doc;
      try {
        doc = frame.contentDocument;
      } catch {
        continue;
      }
      if (!doc || seen.has(doc)) continue;
      const field = doc.querySelector('input');
      if (!field) continue;
      seen.add(doc);
      funnelStep(STEPS.open, 'widget');
      widgetTouched = true;
      doc.addEventListener(
        'input',
        () => {
          inputStarted = true;
          widgetTouched = true;
          funnelStep(STEPS.input, 'widget');
        },
        true
      );
      doc.addEventListener(
        'click',
        () => {
          if (inputStarted) {
            submitted = true;
            funnelStep(STEPS.submit, 'widget');
          }
        },
        true
      );
    }
  };
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, 2000);
}

export function initFunnel() {
  watchVisibility();
  watchModal();
  watchForms();
  watchWidget();

  window.addEventListener('pagehide', () => {
    if (inputStarted && !submitted) funnelStep(STEPS.abandon, widgetTouched ? 'widget' : 'form');
  });
}
