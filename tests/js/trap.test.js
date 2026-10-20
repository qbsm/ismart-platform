import { describe, it, expect } from 'vitest';
import { dropAutofilledTraps, isAutofilled } from '../../assets/js/components/form-callback/trap.js';

// Поле с заданным ответом на matches(): так ведёт себя браузер — заполненное автозаполнением
// поле совпадает с :autofill или :-webkit-autofill, незнакомый селектор бросает SyntaxError.
function input(name, value, states = [], unknown = []) {
  return {
    name,
    value,
    matches(sel) {
      if (unknown.includes(sel)) throw new SyntaxError(`unknown pseudo-class ${sel}`);
      return states.includes(sel);
    },
  };
}

function form(inputs) {
  return { querySelectorAll: () => inputs };
}

function data(entries) {
  const map = new Map(entries);
  return { delete: (k) => map.delete(k), has: (k) => map.has(k) };
}

describe('isAutofilled', () => {
  it(':autofill', () => expect(isAutofilled(input('company_site', 'ООО', [':autofill']))).toBe(true));
  it('старый Chromium/Safari — только :-webkit-autofill, :autofill бросает', () => {
    expect(isAutofilled(input('company_site', 'ООО', [':-webkit-autofill'], [':autofill']))).toBe(true);
  });
  it('браузер не знает ни одного селектора — не автозаполнение', () => {
    expect(isAutofilled(input('company_site', 'x', [], [':autofill', ':-webkit-autofill']))).toBe(false);
  });
  it('значение вписал скрипт — отметки нет', () => expect(isAutofilled(input('company_site', 'bot'))).toBe(false));
});

describe('dropAutofilledTraps', () => {
  it('ловушку от автозаполнения не отправляем', () => {
    const fd = data([
      ['company_site', 'ООО Ромашка'],
      ['phone', '79191218216'],
    ]);
    const dropped = dropAutofilledTraps(form([input('company_site', 'ООО Ромашка', [':autofill'])]), fd);
    expect(dropped).toEqual(['company_site']);
    expect(fd.has('company_site')).toBe(false);
    expect(fd.has('phone')).toBe(true);
  });
  it('ловушку, заполненную роботом, оставляем — сервер её отбросит', () => {
    const fd = data([['company_site', 'https://spam.example']]);
    expect(dropAutofilledTraps(form([input('company_site', 'https://spam.example')]), fd)).toEqual([]);
    expect(fd.has('company_site')).toBe(true);
  });
  it('из двух ловушек снимается только автозаполненная', () => {
    const fd = data([
      ['company_site', 'ООО'],
      ['website', 'https://spam.example'],
    ]);
    dropAutofilledTraps(
      form([input('company_site', 'ООО', [':-webkit-autofill']), input('website', 'https://spam.example')]),
      fd
    );
    expect(fd.has('company_site')).toBe(false);
    expect(fd.has('website')).toBe(true);
  });
  it('пустая ловушка — ничего не трогаем', () => {
    const fd = data([['company_site', '']]);
    expect(dropAutofilledTraps(form([input('company_site', '', [':autofill'])]), fd)).toEqual([]);
    expect(fd.has('company_site')).toBe(true);
  });
});
