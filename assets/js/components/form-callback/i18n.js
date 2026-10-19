import { DEFAULT_ERROR_TEXTS, DEFAULT_LANG } from './constants.js';

export function resolveLang(langValue) {
  if (typeof langValue !== 'string' || !langValue.trim()) {
    return DEFAULT_LANG;
  }

  return langValue.toLowerCase().split('-')[0];
}

export class I18n {
  constructor(formCallbackData = {}, lang = DEFAULT_LANG) {
    this.messages = formCallbackData && typeof formCallbackData === 'object' ? formCallbackData : {};
    this.lang = resolveLang(lang);
  }

  get(category, key, defaultValue = '') {
    const byCategory = this.messages[category];
    if (
      byCategory &&
      typeof byCategory === 'object' &&
      byCategory[this.lang] &&
      typeof byCategory[this.lang] === 'object' &&
      typeof byCategory[this.lang][key] !== 'undefined'
    ) {
      return byCategory[this.lang][key];
    }

    const langDefaults = DEFAULT_ERROR_TEXTS[this.lang] || DEFAULT_ERROR_TEXTS[DEFAULT_LANG];
    if (langDefaults && typeof langDefaults[key] === 'string') {
      return langDefaults[key];
    }

    return defaultValue;
  }
}
