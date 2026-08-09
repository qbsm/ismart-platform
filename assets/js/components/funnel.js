/*
 * Воронка заявки: где именно обрывается путь от «увидел форму» до «отправил».
 *
 * Сейчас в аналитике видны только концы — визит и заявка, — а между ними чёрный ящик. Из-за
 * этого непонятно, почему формы сайта почти не дают заявок, а виджет даёт: люди их не видят,
 * не открывают или бросают на середине заполнения.
 *
 * События уходят пикселем на `/_f`, который nginx отдаёт как 204 не поднимая PHP. Своего
 * хранилища у воронки нет вовсе: строка падает в access-лог, который и так пишется и
 * ротируется, а ночной монитор конверсии её оттуда читает. Постоянная нагрузка — один
 * короткий GET на событие, максимум пять за визит.
 *
 * Содержимое полей не передаётся и не хранится: нужен факт «начал вводить», а не то, что
 * человек напечатал. Для разбора конкретных сеансов есть Вебвизор Метрики.
 */

const SENT_KEY = 'funnel_sent';
const STEPS = {
  seen: 'seen',       // форма или виджет попали в область видимости
  open: 'open',       // форму открыли
  input: 'input',     // начали заполнять
  abandon: 'abandon', // начали заполнять и ушли, не отправив
  submit: 'submit',   // отправили
};

const startedAt = Date.now();
let inputStarted = false;
let submitted = false;

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

/**
 * Отправляет шаг воронки. Каждый шаг — один раз за визит: нас интересует, дошёл ли человек
 * до этапа, а не сколько раз он туда возвращался.
 * @param {string} step одно из STEPS
 * @param {string} where секция или источник события
 */
export function funnelStep(step, where = '') {
  if (!step || alreadySent(step)) return;
  const params = new URLSearchParams({ s: step, t: String(sinceStart()) });
  if (where) params.set('w', where.slice(0, 40));
  const url = `/_f?${params.toString()}`;
  try {
    // sendBeacon переживает уход со страницы — иначе шаг «бросил заполнение» терялся бы
    // ровно в тот момент, ради которого он и нужен.
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else new Image().src = url;
  } catch {
    // Аналитика не должна ничего ломать на сайте.
  }
}

function sectionOf(el) {
  const section = el && el.closest ? el.closest('section, [data-section], .section') : null;
  if (!section) return '';
  return (section.dataset.section || section.id || section.className.split(' ')[0] || '').slice(0, 40);
}

/** Форма или виджет в зоне видимости — значит человек их как минимум мог заметить. */
function watchVisibility() {
  const targets = [...document.querySelectorAll('form, .form-callback, [data-form]')];
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        funnelStep(STEPS.seen, sectionOf(e.target));
        io.disconnect();
        return;
      }
    }
  }, { threshold: 0.3 });
  targets.forEach((t) => io.observe(t));
}

function watchForms() {
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('input, textarea, select')) return;
    if (el.type === 'hidden') return;
    funnelStep(STEPS.open, sectionOf(el));
  }, true);

  // Именно факт ввода, без содержимого: важно, что человек начал заполнять.
  document.addEventListener('input', () => {
    inputStarted = true;
    funnelStep(STEPS.input);
  }, true);

  document.addEventListener('submit', () => {
    submitted = true;
    funnelStep(STEPS.submit);
  }, true);
}

/** Виджет CallTouch живёт в своём iframe — его события ловим отдельно. */
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
      doc.addEventListener('input', () => {
        inputStarted = true;
        funnelStep(STEPS.input, 'widget');
      }, true);
      doc.addEventListener('click', () => {
        if (inputStarted) {
          submitted = true;
          funnelStep(STEPS.submit, 'widget');
        }
      }, true);
    }
  };
  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(scan, 2000);
}

export function initFunnel() {
  watchVisibility();
  watchForms();
  watchWidget();

  // Уход со страницы: если человек начал заполнять и не отправил — это и есть обрыв,
  // который надо чинить. Через pagehide, потому что beforeunload не срабатывает на мобильных.
  window.addEventListener('pagehide', () => {
    if (inputStarted && !submitted) funnelStep(STEPS.abandon);
  });
}
