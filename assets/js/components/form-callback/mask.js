// Маска телефона. Разбор подхода и причины решений — docs.ismart.pro/ismart-platform.

const MASKS = {
  RU: '+7 (999) 999-99-99',
};

const DEFAULT_COUNTRY = 'RU';
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
  }

  init() {
    if (!this.input) return;
    this.input.setAttribute('inputmode', 'tel');
    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('focus', this._onFocus);
    this.input.addEventListener('blur', this._onBlur);
    if (this.input.value) this._handleInput();
  }

  destroy() {
    if (!this.input) return;
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('focus', this._onFocus);
    this.input.removeEventListener('blur', this._onBlur);
  }

  reset() {
    if (this.input) this.input.value = '';
  }

  _handleInput() {
    const atEnd = this.input.selectionStart === this.input.value.length;
    const formatted = formatPhone(this.input.value);
    if (formatted === this.input.value) return;

    this.input.value = formatted;
    if (atEnd) {
      const end = formatted.length;
      this.input.setSelectionRange(end, end);
    }
  }

  _handleFocus() {
    if (!this.input.value) this.input.value = '+7 (';
  }

  _handleBlur() {
    if (nationalDigits(this.input.value).length === 0) this.input.value = '';
  }
}
