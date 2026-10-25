import { describe, it, expect } from 'vitest';

import { formTitle } from '../../assets/js/components/form-callback/form-title.js';

/**
 * Тесты гоняются в окружении node, поэтому DOM здесь минимальный: формa знает только то, чем
 * пользуется сама функция — `closest` и `querySelector`. Этого достаточно, чтобы проверить
 * порядок поиска названия, а вёрстку всё равно проверяют глазами.
 */
function form({ modalHeading, sectionHeading, sectionName, sectionId }) {
  const modal = modalHeading === undefined && !modalHeading
    ? null
    : { querySelector: () => (modalHeading ? { textContent: modalHeading } : null) };

  const section = sectionHeading || sectionName || sectionId
    ? {
      querySelector: () => (sectionHeading ? { textContent: sectionHeading } : null),
      dataset: sectionName ? { section: sectionName } : {},
      id: sectionId || '',
    }
    : null;

  return {
    closest: (selector) => (selector.includes('modal') ? modal : section),
  };
}

describe('formTitle', () => {
  it('берёт заголовок модалки, когда форма в ней', () => {
    expect(formTitle(form({ modalHeading: 'Зафиксировать цену', sectionHeading: 'Контакты' })))
      .toBe('Зафиксировать цену');
  });

  it('берёт заголовок секции для формы на странице', () => {
    expect(formTitle(form({ sectionHeading: '  Оставить\n заявку  ' }))).toBe('Оставить заявку');
  });

  it('падает на служебное имя секции, если заголовка нет', () => {
    expect(formTitle(form({ sectionName: 'callback' }))).toBe('callback');
    expect(formTitle(form({ sectionId: 'contacts' }))).toBe('contacts');
  });

  it('возвращает пустую строку, когда взять нечего', () => {
    expect(formTitle(form({}))).toBe('');
    expect(formTitle(null)).toBe('');
  });

  it('обрезает слишком длинный заголовок', () => {
    const long = 'Очень длинный заголовок секции '.repeat(5);
    expect(formTitle(form({ sectionHeading: long })).length).toBe(80);
  });
});
