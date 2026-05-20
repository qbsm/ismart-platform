import Inputmask from 'inputmask';
import { COUNTRY_CODES, PHONE_MASKS } from './constants.js';
import { normalizePhone } from './validation.js';

const RUSSIAN_COUNTRY_INFO = COUNTRY_CODES[7];

export class PhoneMask {
  constructor(inputElement, lang = 'ru', countryCodes = COUNTRY_CODES) {
    this.input = inputElement;
    void lang;
    void countryCodes;
    this.maskInstance = null;
    this.currentCountryInfo = RUSSIAN_COUNTRY_INFO;
    this._boundOnFocus = this._onFocus.bind(this);
    this._boundOnInput = this._onInput.bind(this);
    this._boundOnBlur = this._onBlur.bind(this);
    this._boundOnChange = this._onChange.bind(this);
    this._boundOnAnimationStart = this._onAnimationStart.bind(this);
  }

  init() {
    if (!this.input) {
      return;
    }

    this._applyMask(false);

    this.input.addEventListener('focus', this._boundOnFocus);
    this.input.addEventListener('input', this._boundOnInput);
    this.input.addEventListener('blur', this._boundOnBlur);
    this.input.addEventListener('change', this._boundOnChange);
    this.input.addEventListener('animationstart', this._boundOnAnimationStart);

    setTimeout(() => {
      if (this.input && this.input.value.trim() !== '') {
        this._onChange();
      }
    }, 200);
  }

  destroy() {
    if (!this.input) {
      return;
    }

    this.input.removeEventListener('focus', this._boundOnFocus);
    this.input.removeEventListener('input', this._boundOnInput);
    this.input.removeEventListener('blur', this._boundOnBlur);
    this.input.removeEventListener('change', this._boundOnChange);
    this.input.removeEventListener('animationstart', this._boundOnAnimationStart);

    if (this.input.inputmask) {
      this.input.inputmask.remove();
    }

    this.maskInstance = null;
    this.currentCountryInfo = RUSSIAN_COUNTRY_INFO;
    this.input.removeAttribute('data-country-code');
    this.input.removeAttribute('data-detected-format');
  }

  reset() {
    if (!this.input) {
      return;
    }
    if (this.input.inputmask) {
      this.input.inputmask.remove();
    }
    this.input.value = '';
    this.input.removeAttribute('data-country-code');
    this.input.removeAttribute('data-detected-format');
    this._applyMask(false);
  }

  _onFocus() {
    if (!this.input.value.trim()) {
      this.input.value = RUSSIAN_COUNTRY_INFO.code;
    }
  }

  _onInput() {
    this._syncRussianValue(false);
  }

  _onChange() {
    const normalized = this._normalizeRussianNumber(normalizePhone(this.input.value));
    if (!normalized) {
      return;
    }

    this._syncRussianValue(true, normalized);
  }

  _onBlur() {
    const digitsOnly = normalizePhone(this.input.value);
    const countryCodeDigits = normalizePhone(this.input.getAttribute('data-country-code') || '');
    const hasOnlyCountryCode =
      digitsOnly === countryCodeDigits || digitsOnly.length <= (countryCodeDigits ? countryCodeDigits.length : 1);

    if (hasOnlyCountryCode) {
      this.input.value = '';
      this.input.removeAttribute('data-country-code');
      this.input.removeAttribute('data-detected-format');
    }
  }

  _onAnimationStart(event) {
    if (event.animationName && event.animationName.includes('autofill')) {
      setTimeout(() => this._onChange(), 50);
    }
  }

  _syncRussianValue(preserveDigits, forcedDigits = '') {
    const digits = forcedDigits || normalizePhone(this.input.value);
    if (!digits) {
      this.input.removeAttribute('data-country-code');
      this.input.removeAttribute('data-detected-format');
      return;
    }

    const normalized = this._normalizeRussianNumber(digits);
    this._applyMask(preserveDigits, normalized);
  }

  _applyMask(preserveDigits, normalizedDigits = '') {
    if (!this.input) {
      return;
    }

    const currentDigits = normalizePhone(this.input.value);
    const normalizedCurrentDigits = normalizedDigits || this._normalizeRussianNumber(currentDigits);

    if (this.input.inputmask) {
      this.input.inputmask.remove();
    }

    const maskPattern = PHONE_MASKS.russia;
    this.maskInstance = new Inputmask({
      mask: maskPattern,
      placeholder: '_',
      showMaskOnHover: false,
      clearIncomplete: false,
      jitMasking: true,
    });
    this.maskInstance.mask(this.input);

    this.currentCountryInfo = RUSSIAN_COUNTRY_INFO;
    this._setAttributes();

    if (preserveDigits && normalizedCurrentDigits) {
      const countryCodeDigits = normalizePhone(RUSSIAN_COUNTRY_INFO.code);
      const localDigits = normalizedCurrentDigits.startsWith(countryCodeDigits)
        ? normalizedCurrentDigits.slice(countryCodeDigits.length)
        : normalizedCurrentDigits;
      this.input.inputmask.setValue(localDigits);
    } else if (!this.input.value.trim()) {
      this.input.value = RUSSIAN_COUNTRY_INFO.code;
    }
  }

  _setAttributes() {
    this.input.setAttribute('data-country-code', RUSSIAN_COUNTRY_INFO.code);
    this.input.setAttribute('data-detected-format', RUSSIAN_COUNTRY_INFO.format);
  }

  _normalizeRussianNumber(digits) {
    if (digits.length === 11 && digits.startsWith('8')) {
      return `7${digits.slice(1)}`;
    }
    if (digits.length === 10 && digits.startsWith('9')) {
      return `7${digits}`;
    }
    return digits;
  }
}
