// Проверка формы в браузере поверх rules.js (proposal 0025). Один и тот же слой для формы
// платформы и для разметки других стеков: всё, что отличается, — селекторы контейнера поля
// и места под текст ошибки, они приходят параметрами.
//
// Поведение:
// - до первого «Отправить» молчим; исключение — неполный номер или почта при уходе из поля,
//   если в нём что-то набрано;
// - на «Отправить» показываем все ошибки сразу, каждую под своим полем, фокус — на первое;
// - дальше ошибка гаснет, как только поле стало верным, а новая появляется только при уходе
//   из поля или смене значения — не посреди набора.
import { check, digitsOf } from './rules.js';
import { DEFAULT_LANG, messageFor, summaryText } from './messages.js';

// Служебные поля форм платформы и площадок: человек их не видит и заполнять не должен.
const SERVICE_NAMES = new Set([
  'csrf_token',
  'current_url',
  'form_token',
  'idempotency_key',
  'phone_digits',
  'phone_shown',
  'smart-token',
]);

let slotSeq = 0;

const DEFAULTS = {
  field: '.form-callback__field',
  message: '.form-callback__error-msg',
  messageClass: 'form-callback__error-msg',
  errorClass: 'error',
  lang: DEFAULT_LANG,
  messages: {},
  // Вызывается после каждого изменения набора ошибок — форма обновляет сводку.
  onUpdate: null,
};

function kindOf(el) {
  if (el.type === 'tel' || el.name === 'phone') return 'phone';
  if (el.type === 'email') return 'email';
  if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') return el.type;
  if (el.tagName === 'SELECT') return 'select';
  return 'text';
}

function isRequired(el) {
  if (el.required || el.getAttribute('aria-required') === 'true') return true;
  const group = el.closest('fieldset[aria-required="true"], [role="radiogroup"][aria-required="true"]');
  return !!group;
}

function addToken(el, attr, token) {
  const list = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
  if (!list.includes(token)) list.push(token);
  el.setAttribute(attr, list.join(' '));
}

function removeToken(el, attr, token) {
  const list = (el.getAttribute(attr) || '').split(/\s+/).filter((t) => t && t !== token);
  if (list.length) el.setAttribute(attr, list.join(' '));
  else el.removeAttribute(attr);
}

function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export class FormChecker {
  constructor(form, options = {}) {
    this.form = form;
    this.opt = { ...DEFAULTS, ...options };
    this.armed = false;
    this.shown = new Map();
    this._onInput = this._onInput.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onFocusOut = this._onFocusOut.bind(this);
  }

  init() {
    // Подсказки браузера сами по себе: свой текст, своё место, по одному полю за раз. Чтобы
    // логика была одна на все стеки, его проверку выключаем и проверяем сами.
    this.form.noValidate = true;
    this.form.addEventListener('input', this._onInput);
    this.form.addEventListener('change', this._onChange);
    this.form.addEventListener('focusout', this._onFocusOut);
    return this;
  }

  destroy() {
    this.form.removeEventListener('input', this._onInput);
    this.form.removeEventListener('change', this._onChange);
    this.form.removeEventListener('focusout', this._onFocusOut);
    this.clearAll();
  }

  /** Поля, которые человек видит и заполняет; у группы радиокнопок — первая кнопка группы. */
  controls() {
    const seen = new Set();
    const list = [];
    this.form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || seen.has(el.name) || SERVICE_NAMES.has(el.name)) return;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.disabled) return;
      // Ловушка для роботов спрятана от людей: tabindex=-1 или контейнер aria-hidden.
      if (el.tabIndex === -1 || el.closest('[aria-hidden="true"]')) return;
      if (!this._visible(el)) return;
      seen.add(el.name);
      list.push(el);
    });
    return list;
  }

  describe(el) {
    return {
      name: el.name,
      kind: kindOf(el),
      required: isRequired(el),
      minLength: parseInt(el.getAttribute('minlength') || '0', 10) || 0,
      countryCode: el.getAttribute('data-country-code') || '',
    };
  }

  stateOf(el) {
    const kind = kindOf(el);
    if (kind === 'checkbox') return { checked: el.checked };
    if (kind === 'radio') {
      const group = this.form.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
      return { count: Array.from(group).filter((r) => r.checked).length };
    }
    if (kind === 'file') return { count: el.files ? el.files.length : 0 };
    if (kind === 'phone') {
      // Номер — из скрытого phone_digits, которое ведёт маска платформы: там цифры без
      // разбивки, с кодом страны, посчитанные из того же ввода, что и показанный формат.
      // Но только пока в видимом набрано больше подставленной маской «+7»: скрытое переживает
      // form.reset() и могло бы выдать цифры прошлой заявки за набранные сейчас.
      const shown = digitsOf(el.value);
      if (shown.length < 2) return { value: '' };
      const hidden = this.form.querySelector('input[name="phone_digits"]');
      return { value: (hidden && hidden.value) || shown };
    }
    return { value: el.value };
  }

  /** Ошибка одного поля: {name, code, kind, message, el} или null. */
  checkOne(el) {
    const field = this.describe(el);
    const code = check(field, this.stateOf(el));
    if (!code) return null;
    return {
      name: field.name,
      code,
      kind: field.kind,
      message: messageFor(field.name, code, field.kind, this.opt.lang, this.opt.messages),
      el,
    };
  }

  validate() {
    return this.controls()
      .map((el) => this.checkOne(el))
      .filter(Boolean);
  }

  /**
   * Нажали «Отправить»: показать все ошибки, перевести форму в режим «на лету», поставить
   * фокус на первое поле с ошибкой. Возвращает ошибки и текст сводки.
   */
  run() {
    const errors = this.validate();
    this.armed = true;
    this.clearAll();
    errors.forEach((e) => this.setError(e.el, e.message));
    if (errors.length) this.focus(errors[0].el);
    this._update();
    return { errors, fields: errors.map((e) => e.name), summary: this.summary(errors.length) };
  }

  summary(count) {
    return count > 1 ? summaryText(count, this.opt.lang, this.opt.messages) : '';
  }

  /**
   * Ошибки сервера (422 `{errors: {поле: текст}}`) — в те же места, что ошибки фронта.
   * Возвращает тексты для полей, которых в форме нет: их показывают в общей плашке.
   */
  showServerErrors(errors = {}) {
    this.armed = true;
    const orphans = [];
    let first = null;
    Object.entries(errors).forEach(([name, message]) => {
      const el = this.form.querySelector(`[name="${CSS.escape(name)}"]`);
      if (!el || el.type === 'hidden') {
        orphans.push(String(message));
        return;
      }
      this.setError(el, String(message));
      first = first || el;
    });
    if (first) this.focus(first);
    this._update();
    return orphans;
  }

  setError(el, message) {
    const box = this._container(el);
    box.classList.add(this.opt.errorClass);
    const existing = box.querySelector(this.opt.message);
    const before = existing ? existing.id : '';
    const slot = this._slot(el, box);
    slot.textContent = message;
    this._group(el).forEach((input) => {
      if (before && before !== slot.id) removeToken(input, 'aria-describedby', before);
      input.setAttribute('aria-invalid', 'true');
      addToken(input, 'aria-describedby', slot.id);
    });
    this.shown.set(el.name, message);
  }

  clearError(el) {
    const box = this._container(el);
    box.classList.remove(this.opt.errorClass);
    const slot = box.querySelector(this.opt.message);
    if (slot) slot.textContent = '';
    this._group(el).forEach((input) => {
      input.removeAttribute('aria-invalid');
      if (slot && slot.id) removeToken(input, 'aria-describedby', slot.id);
    });
    this.shown.delete(el.name);
  }

  clearAll() {
    this.form.querySelectorAll('[aria-invalid="true"]').forEach((el) => this.clearError(el));
    this.form.querySelectorAll(`.${this.opt.errorClass}`).forEach((box) => box.classList.remove(this.opt.errorClass));
    this.shown.clear();
  }

  /** После успешной отправки форма снова «не трогали»: ошибки до первого нажатия не нужны. */
  reset() {
    this.armed = false;
    this.clearAll();
    this._update();
  }

  focus(el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    // Прокручиваем контейнер поля, а не сам input: у галки он скрыт, и прокрутка к нему
    // уводила бы подпись за край. В модалке прокручивается её собственный скролл.
    const box = this._container(el);
    if (box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  get errorCount() {
    return this.shown.size;
  }

  _recheck(el, { allowNew }) {
    const error = this.checkOne(el);
    if (!error) {
      if (this.shown.has(el.name)) this.clearError(el);
    } else if (allowNew || this.shown.has(el.name)) {
      this.setError(el, error.message);
    }
    this._update();
  }

  _control(target) {
    if (!target || !target.name || !this.form.contains(target)) return null;
    // Скрытые цифры маски относятся к видимому телефону; имя у него не везде phone (на старых
    // сайтах — «Телефон»), поэтому ищем по типу.
    if (target.name === 'phone_digits') return this.form.querySelector('input[type="tel"], input[name="phone"]');
    return this.controls().find((el) => el.name === target.name) || null;
  }

  _onInput(e) {
    const el = this._control(e.target);
    if (!el) return;
    // Во время набора ошибка только гаснет: ругать недопечатанный номер рано.
    const error = this.checkOne(el);
    if (!error && this.shown.has(el.name)) {
      this.clearError(el);
      this._update();
    }
  }

  _onChange(e) {
    const el = this._control(e.target);
    if (!el) return;
    const kind = kindOf(el);
    const discrete = kind === 'checkbox' || kind === 'radio' || kind === 'select' || kind === 'file';
    if (this.armed || this.shown.has(el.name)) this._recheck(el, { allowNew: discrete || this.armed });
  }

  _onFocusOut(e) {
    const el = this._control(e.target);
    if (!el) return;
    const kind = kindOf(el);
    if (kind === 'checkbox' || kind === 'radio' || kind === 'file') return;
    if (this.armed) {
      this._recheck(el, { allowNew: true });
      return;
    }
    // До первого нажатия — только начатый и брошенный номер или почта.
    if ((kind === 'phone' || kind === 'email') && String(el.value || '').trim() && digitsOrValue(el)) {
      this._recheck(el, { allowNew: true });
    }
  }

  _update() {
    if (typeof this.opt.onUpdate === 'function') this.opt.onUpdate(this.shown.size, this);
  }

  _visible(el) {
    const box = this._container(el);
    if (!box.getClientRects().length) return false;
    const styles = window.getComputedStyle(box);
    return styles.display !== 'none' && styles.visibility !== 'hidden' && parseFloat(styles.opacity) !== 0;
  }

  _container(el) {
    return el.closest(this.opt.field) || el.parentElement || el;
  }

  _group(el) {
    if (el.type !== 'radio') return [el];
    return Array.from(this.form.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
  }

  _slot(el, box) {
    let slot = box.querySelector(this.opt.message);
    if (!slot) {
      slot = document.createElement('span');
      slot.className = this.opt.messageClass;
      box.appendChild(slot);
    }
    // id нужен только для aria-describedby и выдаётся здесь, а не в разметке: формы
    // переиспользуются (одна и та же в секции и в модалке, клоны), и id из шаблона повторялись бы.
    // Клон уже показанной формы уносит и выданный id — тогда выдаём новый.
    if (!slot.id || document.getElementById(slot.id) !== slot) {
      slotSeq += 1;
      slot.id = `form-error-${slotSeq}`;
    }
    return slot;
  }
}

// Маска телефона подставляет «+7 (» сразу при фокусе: такое поле не начато, ругать его на
// уходе нельзя. Для почты достаточно непустого значения.
function digitsOrValue(el) {
  if (kindOf(el) !== 'phone') return true;
  return digitsOf(el.value).length > 1;
}
