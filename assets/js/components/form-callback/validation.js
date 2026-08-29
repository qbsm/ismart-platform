import { DEFAULT_ERROR_TEXTS, MIN_PHONE_LENGTH_AFTER_CODE } from './constants.js';

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isRequired(value) {
  return String(value || '').trim().length > 0;
}

export function isMinLength(value, minLength) {
  return String(value || '').trim().length >= minLength;
}

export function isValidEmail(value) {
  if (!isRequired(value)) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

export function isValidPhone(digits, countryCodeDigits = '') {
  if (!digits || digits.length <= 1) {
    return false;
  }
  if (countryCodeDigits) {
    return digits.length >= countryCodeDigits.length + MIN_PHONE_LENGTH_AFTER_CODE;
  }
  return digits.length >= 7;
}

export function isFieldVisible(field) {
  if (!field) {
    return false;
  }

  const fieldItem = field.closest('.form-callback__field');
  if (!fieldItem) {
    return true;
  }

  const styles = window.getComputedStyle(fieldItem);
  if (styles.display === 'none') {
    return false;
  }
  if (styles.visibility === 'hidden') {
    return false;
  }
  if (parseFloat(styles.opacity) === 0) {
    return false;
  }

  return true;
}

export class FormValidator {
  constructor(form, i18n) {
    this.form = form;
    this.i18n = i18n;
    const lang = this.i18n.lang || 'ru';
    this.defaults = DEFAULT_ERROR_TEXTS[lang] || DEFAULT_ERROR_TEXTS.ru;
  }

  validate() {
    const errors = {};
    let firstError = '';

    const setError = (fieldName, message) => {
      errors[fieldName] = message;
      if (!firstError) {
        firstError = message;
      }
    };

    // Собираем все видимые поля формы (кроме hidden, submit, csrf_token, current_url)
    const skipNames = new Set(['csrf_token', 'current_url']);
    const fields = this.form.querySelectorAll('input, select, textarea');

    fields.forEach((field) => {
      const name = field.name;
      if (!name || skipNames.has(name) || field.type === 'hidden' || field.type === 'submit') {
        return;
      }
      if (!isFieldVisible(field)) {
        return;
      }

      const isReq = field.getAttribute('aria-required') === 'true';

      // --- Телефон ---
      if (field.type === 'tel') {
        const value = field.value.trim();
        const digits = normalizePhone(value);
        const countryCodeDigits = normalizePhone(field.getAttribute('data-country-code') || '');

        if (isReq && !isRequired(value)) {
          setError(name, this._text('phone_required'));
        } else if (isRequired(value) && !isValidPhone(digits, countryCodeDigits)) {
          setError(name, this._text('phone_invalid'));
        }
        return;
      }

      // --- Email ---
      if (field.type === 'email') {
        const value = field.value.trim();
        if (isReq && !isRequired(value)) {
          setError(name, this._text('email_required'));
        } else if (isRequired(value) && !isValidEmail(value)) {
          setError(name, this._text('email_invalid'));
        }
        return;
      }

      // --- Чекбокс ---
      if (field.type === 'checkbox') {
        if (isReq && !field.checked) {
          setError(name, this._text(name + '_required'));
        }
        return;
      }

      // --- Файл ---
      if (field.type === 'file') {
        if (isReq && (!field.files || field.files.length === 0)) {
          setError(name, this._text(name + '_required'));
        }
        return;
      }

      // --- Текстовые поля, select, textarea ---
      const value = field.value.trim();

      if (isReq && !isRequired(value)) {
        setError(name, this._text(name + '_required'));
        return;
      }

      // minLength (по атрибуту или по имени поля name → 2 символа)
      if (isRequired(value)) {
        const minLen = field.getAttribute('minlength');
        if (minLen && !isMinLength(value, parseInt(minLen, 10))) {
          setError(name, this._text(name + '_min_length'));
          return;
        }
        // Имя — всегда минимум 2 символа
        if (name === 'name' && !isMinLength(value, 2)) {
          setError(name, this._text('name_min_length'));
          return;
        }
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      firstError,
    };
  }

  _text(key) {
    return this.i18n.get('error', key, this.defaults[key] || '');
  }
}
