// Мелкие помощники — их импортируют тесты и код площадок. Сама проверка формы с выводом
// ошибок — в form-rules (proposal 0025).
import { MIN_PHONE_LENGTH_AFTER_CODE } from './constants.js';

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
