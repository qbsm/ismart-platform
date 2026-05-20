export const API_TIMEOUT_MS = 15000;
export const SUCCESS_RESTORE_DELAY_MS = 4000;
export const MIN_PHONE_LENGTH_AFTER_CODE = 5;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

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

export const DEFAULT_ERROR_TEXTS = {
  ru: {
    phone_required: 'Укажите телефон',
    phone_invalid: 'Неверный телефон',
    name_required: 'Укажите имя',
    name_min_length: 'Имя от 2 символов',
    square_required: 'Укажите площадь',
    policy_required: 'Согласитесь с политикой',
    email_invalid: 'Неверный E-mail',
    form_errors: 'Пожалуйста, исправьте ошибки в форме',
    server_error: 'Произошла ошибка при отправке формы',
    response_error: 'Произошла ошибка при обработке ответа сервера',
    connection_error: 'Ошибка соединения с сервером',
    sending: 'Отправляем заявку',
    success: 'Успешно отправлена',
  },
  en: {
    phone_required: 'Please enter your phone number',
    phone_invalid: 'Invalid phone number format',
    name_required: 'Please enter your name',
    name_min_length: 'Name should be at least 2 characters',
    square_required: 'Please enter area',
    policy_required: 'You must agree to the privacy policy',
    email_invalid: 'Invalid E-mail',
    form_errors: 'Please correct the errors in the form',
    server_error: 'An error occurred while submitting the form',
    response_error: 'An error occurred while processing the response',
    connection_error: 'Server connection error',
    sending: 'Sending request',
    success: 'Successfully sent',
  },
};

export const DEFAULT_LANG = 'ru';
