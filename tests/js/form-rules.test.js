import { describe, it, expect } from 'vitest';
import { check, phoneCode } from '../../assets/js/components/form-rules/rules.js';
import { messageFor, summaryText } from '../../assets/js/components/form-rules/messages.js';

const phone = { name: 'phone', kind: 'phone', required: true };

describe('phoneCode', () => {
  it('российский номер — ровно 11 цифр, как у маячка', () => {
    expect(phoneCode('79991234567')).toBe('');
    expect(phoneCode('89991234567')).toBe('');
    expect(phoneCode('7999123456')).toBe('short');
    expect(phoneCode('799912345678')).toBe('invalid');
  });
  it('другие страны — от длины кода плюс пять', () => {
    expect(phoneCode('3745512345', '374')).toBe('');
    expect(phoneCode('3745512', '374')).toBe('short');
  });
});

describe('check: порядок «пусто → формат → длина»', () => {
  it('пустой обязательный телефон — required, необязательный — без ошибки', () => {
    expect(check(phone, { value: '' })).toBe('required');
    expect(check({ ...phone, required: false }, { value: '' })).toBe('');
  });
  it('недонабранный телефон — short, даже если поле необязательное', () => {
    expect(check(phone, { value: '7999' })).toBe('short');
    expect(check({ ...phone, required: false }, { value: '7999' })).toBe('short');
  });
  it('почта: пустая необязательная проходит, заполненная проверяется', () => {
    const email = { name: 'email', kind: 'email', required: false };
    expect(check(email, { value: '' })).toBe('');
    expect(check(email, { value: 'a@' })).toBe('invalid');
    expect(check(email, { value: 'a@b.ru' })).toBe('');
  });
  it('имя короче двух букв — min_length без атрибута', () => {
    const name = { name: 'name', kind: 'text', required: true };
    expect(check(name, { value: 'И' })).toBe('min_length');
    expect(check(name, { value: 'Ив' })).toBe('');
  });
  it('галки: обязательная без отметки — required, необязательная — никогда', () => {
    expect(check({ name: 'consent', kind: 'checkbox', required: true }, { checked: false })).toBe('required');
    expect(check({ name: 'consent', kind: 'checkbox', required: true }, { checked: true })).toBe('');
    expect(check({ name: 'ads', kind: 'checkbox', required: false }, { checked: false })).toBe('');
  });
  it('несколько галок проверяются независимо', () => {
    const boxes = [
      { name: 'policy', kind: 'checkbox', required: true },
      { name: 'terms', kind: 'checkbox', required: true },
      { name: 'ads', kind: 'checkbox', required: false },
    ];
    const states = [{ checked: true }, { checked: false }, { checked: false }];
    expect(boxes.map((b, i) => check(b, states[i]))).toEqual(['', 'required', '']);
  });
  it('радио и файлы — по числу выбранных', () => {
    expect(check({ name: 'kind', kind: 'radio', required: true }, { count: 0 })).toBe('required');
    expect(check({ name: 'kind', kind: 'radio', required: true }, { count: 1 })).toBe('');
    expect(check({ name: 'doc', kind: 'file', required: true }, { count: 0 })).toBe('required');
  });
});

describe('messageFor', () => {
  it('текст называет поле и действие', () => {
    expect(messageFor('phone', 'short', 'phone')).toBe('Номер неполный — нужно 11 цифр');
    expect(messageFor('policy', 'required', 'checkbox')).toBe('Поставьте галочку согласия на обработку данных');
  });
  it('неизвестная галка получает общий текст по виду поля', () => {
    expect(messageFor('terms', 'required', 'checkbox')).toBe('Поставьте галочку, чтобы отправить заявку');
  });
  it('перекрытие площадки по точному ключу важнее своего текста', () => {
    expect(messageFor('policy', 'required', 'checkbox', 'ru', { policy_required: 'Свой текст' })).toBe('Свой текст');
  });
  it('английский — при lang=en', () => {
    expect(messageFor('phone', 'required', 'phone', 'en')).toBe('Enter your phone number');
  });
});

describe('summaryText', () => {
  it('подставляет число полей', () => {
    expect(summaryText(2)).toBe('Исправьте поля: 2');
  });
});
