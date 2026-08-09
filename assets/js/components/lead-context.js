// Контекст заявки — docs.ismart.pro/api.ismart.pro, раздел «Аналитика конверсии».

const KEY = 'ls_ctx';
const MAX_AGE_SEC = 600;
const TEXT_LIMIT = 80;

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);

function sectionOf(el) {
  const section = el.closest('section, [data-section], .section');
  if (!section) return '';
  return clean(section.dataset.section || section.id || section.className.split(' ')[0]);
}

function remember(el) {
  const text = clean(el.dataset.tag || el.getAttribute('aria-label') || el.textContent);
  if (!text) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      text,
      section: sectionOf(el),
      at: Math.floor(Date.now() / 1000),
    }));
  } catch {
    return;
  }
}

export function leadTrigger() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    const age = Math.floor(Date.now() / 1000) - (t.at || 0);
    if (age > MAX_AGE_SEC) return null;
    return { text: t.text || '', section: t.section || '', age };
  } catch {
    return null;
  }
}

export function appendTrigger(body) {
  const t = leadTrigger();
  if (!t) return;
  body.set('trigger_text', t.text);
  if (t.section) body.set('trigger_section', t.section);
  body.set('trigger_age_sec', String(t.age));
}

function attachToForm(form) {
  const t = leadTrigger();
  if (!t) return;
  const put = (name, value) => {
    let input = form.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  };
  put('trigger_text', t.text);
  if (t.section) put('trigger_section', t.section);
  put('trigger_age_sec', String(t.age));
}

export function initLeadContext() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [role="button"], .btn, [data-tag]');
    if (!el || el.type === 'submit') return;
    remember(el);
  }, true);

  document.addEventListener('submit', (e) => {
    if (e.target instanceof HTMLFormElement) attachToForm(e.target);
  }, true);
}
