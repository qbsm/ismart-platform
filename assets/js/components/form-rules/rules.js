// Правила проверки полей заявки (proposal 0025) — без DOM и без зависимостей, чтобы один и тот
// же модуль работал в форме платформы, на старых twig-сайтах и во Vue. Поле описывается
// дескриптором, состояние — тем, что набрал человек; на выходе код ошибки или пустая строка.
//
// Порядок проверок у поля один: пусто → формат → длина. Код один за раз: два сообщения под
// одним полем читаются хуже, чем одно, исправив которое человек увидит следующее.

export function digitsOf(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isFilled(value) {
  return String(value || '').trim().length > 0;
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * Номер по цифрам с кодом страны. Российский (+7 или 8) — ровно 11 цифр: это тот же порог,
 * по которому маячок считает номер готовым (`phoneReady`), и расходиться им нельзя — иначе
 * форма пропустит номер, который приёмник считает неполным, или наоборот.
 * Остальные страны — от длины кода плюс пять, как раньше в validation.js.
 */
export function phoneCode(digits, countryCodeDigits = '') {
  if (!digits) return 'required';
  if (digits[0] === '7' || digits[0] === '8') {
    return digits.length === 11 ? '' : digits.length < 11 ? 'short' : 'invalid';
  }
  const min = countryCodeDigits ? countryCodeDigits.length + 5 : 7;
  if (digits.length < min) return 'short';
  return digits.length > 15 ? 'invalid' : '';
}

/**
 * @param {{name: string, kind: string, required?: boolean, minLength?: number, countryCode?: string}} field
 * @param {{value?: string, checked?: boolean, count?: number}} state
 * @returns {string} код ошибки: required | short | invalid | min_length, пусто — поле в порядке
 */
export function check(field, state = {}) {
  const required = !!field.required;

  if (field.kind === 'checkbox') {
    return required && !state.checked ? 'required' : '';
  }
  if (field.kind === 'radio' || field.kind === 'file') {
    return required && !(state.count > 0) ? 'required' : '';
  }

  const value = String(state.value || '').trim();
  if (!value) return required ? 'required' : '';

  if (field.kind === 'phone') {
    const code = phoneCode(digitsOf(value), digitsOf(field.countryCode || ''));
    // Пустым номер сюда не доходит: «required» от разбора значит, что цифр нет вовсе.
    return code === 'required' ? 'invalid' : code;
  }
  if (field.kind === 'email') {
    return isEmail(value) ? '' : 'invalid';
  }

  // Имя короче двух букв — почти всегда случайное нажатие, звонить по такому неудобно.
  const minLength = field.minLength || (field.name === 'name' ? 2 : 0);
  return minLength && value.length < minLength ? 'min_length' : '';
}
