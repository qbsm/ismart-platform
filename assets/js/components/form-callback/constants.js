import { MESSAGES } from '../form-rules/messages.js';

// 20 с: дольше человек уже не ждёт, а запрос дольше этого почти всегда не дойдёт.
export const API_TIMEOUT_MS = 20000;
// Лоадер — не сразу: ответ быстрее 300 мс не должен мигать спиннером (proposal 0025).
export const LOADER_DELAY_MS = 300;
// Через 6 с текст кнопки меняется: без этого долгая отправка выглядит зависшей.
export const LOADER_SLOW_MS = 6000;
// Пауза перед единственным повтором при обрыве связи.
export const NETWORK_RETRY_MS = 1500;
// Ниже этой высоты форма — строка, и окно успеха выстраивается в строку по левому краю.
export const SUCCESS_ROW_MAX_HEIGHT = 190;
export const SUCCESS_RESTORE_DELAY_MS = 4000;
export const MIN_PHONE_LENGTH_AFTER_CODE = 5;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
export const AD_KEYS = ['yclid', 'gclid', 'ysclid'];

export const COUNTRY_CODES = {
  1: { code: '+1', country: 'us', format: 'north-america', name: 'USA, Canada' },
  7: { code: '+7', country: 'ru', format: 'russia', name: 'Russia, Kazakhstan' },
  33: { code: '+33', country: 'fr', format: 'standard', name: 'France' },
  34: { code: '+34', country: 'es', format: 'standard', name: 'Spain' },
  39: { code: '+39', country: 'it', format: 'standard', name: 'Italy' },
  44: { code: '+44', country: 'gb', format: 'north-america', name: 'United Kingdom' },
  49: { code: '+49', country: 'de', format: 'standard', name: 'Germany' },
  81: { code: '+81', country: 'jp', format: 'standard', name: 'Japan' },
  86: { code: '+86', country: 'cn', format: 'standard', name: 'China' },
  90: { code: '+90', country: 'tr', format: 'standard', name: 'Turkey' },
  91: { code: '+91', country: 'in', format: 'standard', name: 'India' },
  374: { code: '+374', country: 'am', format: 'standard', name: 'Armenia' },
  375: { code: '+375', country: 'by', format: 'russia', name: 'Belarus' },
  380: { code: '+380', country: 'ua', format: 'russia', name: 'Ukraine' },
  992: { code: '+992', country: 'tj', format: 'standard', name: 'Tajikistan' },
  994: { code: '+994', country: 'az', format: 'standard', name: 'Azerbaijan' },
  995: { code: '+995', country: 'ge', format: 'standard', name: 'Georgia' },
  996: { code: '+996', country: 'kg', format: 'standard', name: 'Kyrgyzstan' },
  998: { code: '+998', country: 'uz', format: 'standard', name: 'Uzbekistan' },
};

export const PHONE_MASKS = {
  russia: '+9 (999) 999-99-99',
  'north-america': '+99 (999) 999-9999',
  standard: '+999 99-999-9999',
};

// Тексты ошибок полей живут в form-rules — один набор на все стеки. Здесь — только тексты
// самой формы: отправка, успех, отказ сервера.
export const DEFAULT_ERROR_TEXTS = {
  ru: {
    ...MESSAGES.ru,
    form_errors: 'Исправьте ошибки в форме',
    server_error: 'Не удалось отправить заявку — нажмите «Отправить» ещё раз.',
    response_error: 'Произошла ошибка при обработке ответа сервера',
    connection_error: 'Не удалось отправить: пропала связь. Данные сохранены — нажмите «Отправить» ещё раз.',
    captcha_pending: 'Подтвердите, что вы не робот, в окне проверки — заявка отправится сама.',
    offline: 'Нет интернета. Данные сохранены — нажмите «Отправить», когда связь появится.',
    online_again: 'Связь появилась — нажмите «Отправить» ещё раз.',
    sending: 'Отправляем…',
    sending_slow: 'Ещё немного…',
    success: 'Успешно отправлена',
    success_text: 'Мы свяжемся с вами в ближайшее время',
    success_text_phone: 'Перезвоним на {phone} в ближайшее время',
    call_us: 'Или позвоните:',
    success_edit: 'Номер с ошибкой? Исправить',
  },
  en: {
    ...MESSAGES.en,
    form_errors: 'Please correct the errors in the form',
    server_error: 'Could not send the request — press Send again.',
    response_error: 'An error occurred while processing the response',
    connection_error: 'Could not send: the connection dropped. Your data is kept — press Send again.',
    captcha_pending: 'Confirm you are not a robot in the check window — the request will be sent automatically.',
    offline: 'No internet. Your data is kept — press Send when you are back online.',
    online_again: 'You are back online — press Send again.',
    sending: 'Sending…',
    sending_slow: 'Almost there…',
    success: 'Successfully sent',
    success_text: 'We will contact you shortly',
    success_text_phone: 'We will call you back at {phone} shortly',
    call_us: 'Or call us:',
    success_edit: 'Wrong number? Edit',
  },
};

export const DEFAULT_LANG = 'ru';
