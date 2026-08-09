/*
 * Контекст заявки: что человек нажал прямо перед тем, как её оставить.
 *
 * Без этого в аналитике видно только «заявка с виджета» — и непонятно, привела к ней карточка
 * модели, блок кредита или баннер акции. Данные о кликах есть только на фронте: виджет
 * CallTouch рисует свою форму сам, а логика сайта живёт отдельно от неё, и связать их можно
 * лишь здесь, в браузере.
 *
 * Запоминаем последний осмысленный клик — текст кнопки и секцию, в которой она стоит.
 * `data-tag` на кнопках предусмотрен шаблоном, но проставлен не везде, поэтому опираемся на
 * текст: он переживает переверстку лучше, чем классы с хэшами.
 *
 * Живёт в sessionStorage, а не в localStorage: контекст имеет смысл в пределах одного визита,
 * а вчерашняя кнопка к сегодняшней заявке отношения не имеет.
 */

const KEY = 'lead_trigger';
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
    // Приватный режим — контекст просто не соберётся, заявка от этого не пострадает.
  }
}

/** Последний клик, если он ещё актуален. @returns {{text:string, section:string, age:number}|null} */
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

/** Кладёт контекст в FormData — для отправок, которые идут мимо разметки формы. */
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
    // Кнопку отправки самой формы не запоминаем: она и так известна из факта заявки, а нужен
    // тот клик, что привёл человека к форме.
    if (!el || el.type === 'submit') return;
    remember(el);
  }, true);

  // Обычные формы платформы отправляются своим кодом — дописываем поля перед сабмитом,
  // не трогая его логику.
  document.addEventListener('submit', (e) => {
    if (e.target instanceof HTMLFormElement) attachToForm(e.target);
  }, true);
}
