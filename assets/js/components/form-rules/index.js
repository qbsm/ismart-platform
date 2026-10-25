// Общий модуль правил формы заявки (proposal 0025): правила без DOM, тексты и DOM-слой.
// Площадки других стеков копируют каталог целиком — как маску телефона, — и подключают
// FormChecker со своими селекторами.
export { check, phoneCode, digitsOf, isFilled, isEmail } from './rules.js';
export { MESSAGES, DEFAULT_LANG, messageFor, summaryText } from './messages.js';
export { FormChecker } from './dom.js';
