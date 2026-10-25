import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  isRequired,
  isMinLength,
  isValidEmail,
  isValidPhone,
} from '../../assets/js/components/form-callback/validation.js';

describe('normalizePhone', () => {
  it('оставляет только цифры', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('79991234567');
    expect(normalizePhone('8 999 123 45 67')).toBe('89991234567');
  });
  it('приводит к строке и убирает не-цифры', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('isRequired', () => {
  it('возвращает true для непустой строки после trim', () => {
    expect(isRequired('a')).toBe(true);
    expect(isRequired('  x  ')).toBe(true);
  });
  it('возвращает false для пустой строки или только пробелов', () => {
    expect(isRequired('')).toBe(false);
    expect(isRequired('   ')).toBe(false);
  });
});

describe('isMinLength', () => {
  it('возвращает true если длина (после trim) >= minLength', () => {
    expect(isMinLength('ab', 2)).toBe(true);
    expect(isMinLength('  ab  ', 2)).toBe(true);
    expect(isMinLength('abc', 2)).toBe(true);
  });
  it('возвращает false если длина меньше minLength', () => {
    expect(isMinLength('a', 2)).toBe(false);
    expect(isMinLength('', 1)).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('возвращает true для пустого значения (необязательное поле)', () => {
    expect(isValidEmail('')).toBe(true);
    expect(isValidEmail('   ')).toBe(true);
  });
  it('возвращает true для валидного email', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('user@example.com')).toBe(true);
  });
  it('возвращает false для невалидного email', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('a@')).toBe(false);
    expect(isValidEmail('@b.co')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('возвращает false для пустой или короткой строки цифр', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('1')).toBe(false);
  });
  it('возвращает true при достаточной длине без кода страны', () => {
    expect(isValidPhone('1234567')).toBe(true);
    expect(isValidPhone('12345678')).toBe(true);
  });
  it('учитывает длину кода страны при переданном countryCodeDigits', () => {
    expect(isValidPhone('79991234567', '7')).toBe(true);
    expect(isValidPhone('79991', '7')).toBe(false); // 5 цифр < 1+5
  });
});
