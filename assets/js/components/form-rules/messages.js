// Тексты ошибок по умолчанию (proposal 0025). Каждый называет поле и действие: в оформлении
// «hint» подпись поля при вводе исчезает, и «Обязательное поле» уже не говорит, о каком речь.
// Площадка перекрывает любой ключ данными — у формы платформы это global.json → error.

export const DEFAULT_LANG = 'ru';

export const MESSAGES = {
  ru: {
    phone_required: 'Укажите телефон',
    phone_short: 'Номер неполный — нужно 11 цифр',
    phone_invalid: 'Проверьте номер телефона',
    name_required: 'Укажите имя',
    name_min_length: 'Имя — от 2 букв',
    email_required: 'Укажите e-mail',
    email_invalid: 'Проверьте e-mail — нужен адрес вида name@mail.ru',
    // `policy` — историческое имя галки согласия на площадках платформы, `consent` — новое.
    // Галка одна, поэтому текст один.
    policy_required: 'Поставьте галочку согласия на обработку данных',
    consent_required: 'Поставьте галочку согласия на обработку данных',
    dealer_required: 'Выберите дилерский центр',
    square_required: 'Укажите площадь',
    checkbox_required: 'Поставьте галочку, чтобы отправить заявку',
    select_required: 'Выберите вариант из списка',
    radio_required: 'Выберите один из вариантов',
    file_required: 'Прикрепите файл',
    required: 'Заполните это поле',
    min_length: 'Слишком коротко',
    summary: 'Исправьте поля: {n}',
  },
  en: {
    phone_required: 'Enter your phone number',
    phone_short: 'The number is incomplete — 11 digits needed',
    phone_invalid: 'Check the phone number',
    name_required: 'Enter your name',
    name_min_length: 'Name should be at least 2 letters',
    email_required: 'Enter your e-mail',
    email_invalid: 'Check the e-mail — it should look like name@mail.com',
    policy_required: 'Tick the box to consent to data processing',
    consent_required: 'Tick the box to consent to data processing',
    dealer_required: 'Choose a dealer',
    square_required: 'Enter the area',
    checkbox_required: 'Tick the box to send the request',
    select_required: 'Choose an option from the list',
    radio_required: 'Choose one of the options',
    file_required: 'Attach a file',
    required: 'Fill in this field',
    min_length: 'Too short',
    summary: 'Fix the fields: {n}',
  },
};

/**
 * Текст ошибки: сперва перекрытие площадки по точному ключу (`phone_short`), затем свой текст
 * по умолчанию, затем общий по виду поля (`checkbox_required`) и, наконец, общий по коду.
 */
export function messageFor(name, code, kind, lang = DEFAULT_LANG, overrides = {}) {
  const own = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  const keys = [`${name}_${code}`, `${kind}_${code}`, code];
  for (const key of keys) {
    if (typeof overrides[key] === 'string' && overrides[key] !== '') return overrides[key];
    if (typeof own[key] === 'string') return own[key];
  }
  return own.required;
}

export function summaryText(count, lang = DEFAULT_LANG, overrides = {}) {
  const own = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  const template = typeof overrides.summary === 'string' && overrides.summary ? overrides.summary : own.summary;
  return template.replace('{n}', String(count));
}
