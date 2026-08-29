// Маска телефона. Разбор подхода и причины решений — docs.ismart.pro/ismart-platform.

const MASKS = {
  RU: '+7 (999) 999-99-99',
};

const DEFAULT_COUNTRY = 'RU';
// Код страны из поля не убирается: стерев всё, человек видит «+7 » и продолжает набор с той
// же точки, а не с пустого места. Так ведут себя формы, у которых номер вводят чаще всего.
const TRUNK = '+7 ';
const PREFIX_RE = /^(\+\s*7|8|7)/;
const DIGIT_SLOT = /9/g;

function nationalDigits(raw) {
  const slots = (MASKS[DEFAULT_COUNTRY].match(DIGIT_SLOT) || []).length;
  let digits = String(raw || '').replace(PREFIX_RE, '').replace(/\D+/g, '');

  // Якорь снимает код только в начале строки, а он туда попадает не всегда: при вставке в поле
  // с готовым «+7 (» код страны идёт следом за префиксом. Лишние ведущие цифры отбрасываем по
  // длине — национальный номер занимает ровно слоты маски.
  while (digits.length > slots && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, slots);
}

function formatPhone(raw) {
  const digits = nationalDigits(raw);
  if (!digits) return '';

  let index = 0;
  let out = '';
  for (const ch of MASKS[DEFAULT_COUNTRY]) {
    if (ch !== '9') {
      out += ch;
      continue;
    }
    if (index >= digits.length) break;
    out += digits[index++];
  }

  return out.replace(/[\s()-]+$/, '');
}

export function phoneDigits(value) {
  const digits = nationalDigits(value);
  return digits ? `7${digits}` : '';
}

export class PhoneMask {
  constructor(inputElement) {
    this.input = inputElement;
    this._onInput = this._handleInput.bind(this);
    this._onFocus = this._handleFocus.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onCaret = this._guardCaret.bind(this);
  }

  init() {
    if (!this.input) return;
    this.input.setAttribute('inputmode', 'tel');
    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('focus', this._onFocus);
    this.input.addEventListener('blur', this._onBlur);
    this.input.addEventListener('click', this._onCaret);
    this.input.addEventListener('keyup', this._onCaret);
    if (this.input.value) this._handleInput();
  }

  destroy() {
    if (!this.input) return;
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('focus', this._onFocus);
    this.input.removeEventListener('blur', this._onBlur);
    this.input.removeEventListener('click', this._onCaret);
    this.input.removeEventListener('keyup', this._onCaret);
  }

  reset() {
    if (this.input) this.input.value = '';
  }

  _handleInput() {
    const atEnd = this.input.selectionStart === this.input.value.length;
    const formatted = formatPhone(this.input.value) || TRUNK;
    if (formatted === this.input.value) return;

    this.input.value = formatted;
    if (atEnd) {
      const end = formatted.length;
      this.input.setSelectionRange(end, end);
    }
  }

  _handleFocus() {
    if (!this.input.value) this.input.value = TRUNK;
    // Каретку ставим после отрисовки: браузер обрабатывает клик по полю уже после focus и
    // иначе возвращает её туда, куда пришёлся клик, — то есть перед «+7».
    this._caretToEnd();
  }

  _caretToEnd() {
    const end = this.input.value.length;
    requestAnimationFrame(() => {
      try {
        this.input.setSelectionRange(end, end);
      } catch {
        // поле уже потеряло фокус — ставить нечего
      }
    });
  }

  /** Внутрь «+7 » каретке делать нечего: там нечего править. Выделение не трогаем. */
  _guardCaret() {
    const { selectionStart, selectionEnd, value } = this.input;
    if (selectionStart !== selectionEnd || selectionStart >= TRUNK.length) return;
    const pos = Math.max(TRUNK.length, Math.min(selectionStart, value.length));
    this.input.setSelectionRange(pos, pos);
  }

  /**
   * Поле, покинутое без единой цифры, очищаем полностью: иначе плавающая подпись остаётся
   * поднятой и форма выглядит начатой, хотя телефона в ней нет.
   */
  _handleBlur() {
    if (nationalDigits(this.input.value).length === 0) this.input.value = '';
  }
}
