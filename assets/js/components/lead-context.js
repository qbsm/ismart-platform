// Контекст заявки — docs.ismart.pro/api.ismart.pro, раздел «Аналитика конверсии».

const KEY = 'ls_ctx';
const PATH_KEY = 'ls_path';
const START_KEY = 'ls_t0';
const MAX_AGE_SEC = 600;
const TEXT_LIMIT = 80;
const PATH_HEAD = 2;
const PATH_TAIL = 6;

// Служебные кнопки в цепочку не идут: «Закрыть» и «Показать ещё» встречались чаще, чем
// названия моделей, и вытесняли из пути то, ради чего он собирается.
const SERVICE_TEXT = /^(закрыть|close|показать ещё|показать еще|ещё|наверх|принять|отклонить|согласен|хорошо|ок|ok|меню|menu|[×✕✖x])$/i;
const SERVICE_SELECTOR = '[class*="close"], [class*="burger"], [class*="cookie"], [class*="to-top"], [class*="scroll-top"]';
const COLOR_SELECTOR = '[data-color], [class*="color-item"], [class*="colorpicker"], [class*="color-pick"], [class*="colors__"]';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);
const now = () => Math.floor(Date.now() / 1000);

function sectionOf(el) {
  const section = el.closest('section, [data-section], .section');
  if (!section) return '';
  return clean(section.dataset.section || section.id || section.className.split(' ')[0]);
}

// Кнопка «Узнать цену» сама по себе не говорит, о какой машине речь. Модель берём из
// карточки, в которой она лежит, — так же, как это делает заголовок формы.
function cardTitle(el) {
  let node = el.parentElement;
  for (let depth = 0; depth < 6 && node; depth++) {
    if (node.matches('section, main, body')) break;
    const heading = node.querySelector('h1, h2, h3, h4, [class*="__title"], [class*="__heading"]');
    if (heading) return clean(heading.textContent);
    node = node.parentElement;
  }
  return '';
}

function startedAt() {
  try {
    const stored = Number(sessionStorage.getItem(START_KEY) || 0);
    if (stored) return stored;
    const t0 = now();
    sessionStorage.setItem(START_KEY, String(t0));
    return t0;
  } catch {
    return now();
  }
}

// Метки входа может не быть: вкладка открыта до выкладки этого кода, хранилище почищено.
// Тогда точкой отсчёта берём первый клик — иначе весь путь схлопнется в «@0с».
function baseTime(path) {
  try {
    const stored = Number(sessionStorage.getItem(START_KEY) || 0);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return path.length ? path[0].at : now();
}

function readPath() {
  try {
    return JSON.parse(sessionStorage.getItem(PATH_KEY) || '[]');
  } catch {
    return [];
  }
}

// Первые шаги показывают, с чего человек начал, последние — на чём решился. Режем середину.
function trimPath(path) {
  if (path.length <= PATH_HEAD + PATH_TAIL) return path;
  return path.slice(0, PATH_HEAD).concat(path.slice(-PATH_TAIL));
}

function remember(el) {
  let text = clean(el.dataset.tag || el.getAttribute('aria-label') || el.textContent);
  if (!text || SERVICE_TEXT.test(text) || el.closest(SERVICE_SELECTOR)) return;

  const section = sectionOf(el);
  const title = cardTitle(el);
  if (title && !text.includes(title) && !title.includes(text)) {
    text = clean(`${text} · ${title}`);
  }

  const at = now();
  const isColor = Boolean(el.closest(COLOR_SELECTOR));

  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text, section, at }));

    const path = readPath();
    const last = path[path.length - 1];

    if (last && last.text === text && last.section === section) {
      last.n = (last.n || 1) + 1;
      last.till = at;
    } else if (last && last.color && isColor && last.section === section) {
      // Перебор цветов — это одно действие, а не пять: держим последний выбранный.
      path[path.length - 1] = { text, section, at: last.at, till: at, n: (last.n || 1) + 1, color: true };
    } else {
      const step = { text, section, at };
      if (isColor) step.color = true;
      path.push(step);
    }

    sessionStorage.setItem(PATH_KEY, JSON.stringify(trimPath(path)));
  } catch {
    /* ignore */
  }
}

export function leadTrigger() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    const age = now() - (t.at || 0);
    if (age > MAX_AGE_SEC) return null;
    return { text: t.text || '', section: t.section || '', age };
  } catch {
    return null;
  }
}

export function leadPath() {
  const path = readPath();
  if (!path.length) return '';

  const t0 = baseTime(path);
  return path
    .map((s) => {
      const when = Math.max(0, (s.at || t0) - t0);
      const repeat = s.n > 1 ? ` ×${s.n}` : '';
      return `${s.text}${s.section ? '/' + s.section : ''}@${when}с${repeat}`;
    })
    .join(' → ')
    .slice(0, 400);
}

export function timeOnSite() {
  return Math.max(0, now() - baseTime(readPath()));
}

export function appendTrigger(body) {
  body.set('time_on_site_sec', String(timeOnSite()));

  const path = leadPath();
  if (path) body.set('trigger_path', path);

  const t = leadTrigger();
  if (!t) return;
  body.set('trigger_text', t.text);
  if (t.section) body.set('trigger_section', t.section);
  body.set('trigger_age_sec', String(t.age));
}

function attachToForm(form) {
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

  put('time_on_site_sec', String(timeOnSite()));

  const path = leadPath();
  if (path) put('trigger_path', path);

  const t = leadTrigger();
  if (!t) return;
  put('trigger_text', t.text);
  if (t.section) put('trigger_section', t.section);
  put('trigger_age_sec', String(t.age));
}

export function initLeadContext() {
  startedAt();

  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [role="button"], .btn, [data-tag]');
    if (!el || el.type === 'submit') return;
    remember(el);
  }, true);

  document.addEventListener('submit', (e) => {
    if (e.target instanceof HTMLFormElement) attachToForm(e.target);
  }, true);
}
