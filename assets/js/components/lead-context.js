// Контекст заявки — docs.ismart.pro/api.ismart.pro, раздел «Аналитика конверсии».

const KEY = 'ls_ctx';
const PATH_KEY = 'ls_path';
const PATH_LIMIT = 8;
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
  const step = { text, section: sectionOf(el), at: Math.floor(Date.now() / 1000) };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(step));
    const path = JSON.parse(sessionStorage.getItem(PATH_KEY) || '[]');
    const last = path[path.length - 1];
    if (!last || last.text !== step.text || step.at - last.at > 2) {
      path.push(step);
      sessionStorage.setItem(PATH_KEY, JSON.stringify(path.slice(-PATH_LIMIT)));
    }
  } catch {
    return;
  }
}

export function leadPath() {
  try {
    const path = JSON.parse(sessionStorage.getItem(PATH_KEY) || '[]');
    if (!path.length) return '';
    const start = path[0].at;
    return path
      .map((s) => `${s.text}${s.section ? '/' + s.section : ''}@${s.at - start}с`)
      .join(' → ')
      .slice(0, 400);
  } catch {
    return '';
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
  const path = leadPath();
  if (path) body.set('trigger_path', path);
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
  const path = leadPath();
  if (path) put('trigger_path', path);
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
