const TEXT_LIMIT = 80;

const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT);

const HEADING = 'h1, h2, h3, .heading, [class*="__heading"], [class*="__title"]';

/**
 * Название формы, когда его не дала кнопка.
 *
 * Формы, открытые по кнопке, приносят название сами (`data-modal-source`), а встроенные в
 * страницу — нет: в заявке оставалась пустая графа, и по ней нельзя было понять, откуда
 * человек написал. Берём то, что видит посетитель: заголовок модалки, иначе заголовок секции,
 * иначе её служебное имя.
 */
export function formTitle(form) {
  if (!form) return '';

  const modal = form.closest('.modal, [class*="modal"]');
  if (modal) {
    const heading = modal.querySelector(HEADING);
    if (heading) return clean(heading.textContent);
  }

  const section = form.closest('section, [data-section], .section');
  if (!section) return '';

  const heading = section.querySelector(HEADING);
  if (heading) return clean(heading.textContent);

  return clean(section.dataset.section || section.id || '');
}
