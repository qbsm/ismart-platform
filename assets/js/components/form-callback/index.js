import { FormApi } from './api.js';
import { primeFormToken, ensureFormToken, refreshFormToken } from './token.js';
import { FormValidator } from './validation.js';
import { PhoneMask } from './mask.js';
import { FormUI } from './ui.js';
import { I18n, resolveLang } from './i18n.js';
import { COUNTRY_CODES, DEFAULT_ERROR_TEXTS, DEFAULT_LANG } from './constants.js';
import { normalizePhone } from './validation.js';

export class CallbackForm {
  constructor(formElement, config = {}) {
    this.form = formElement;
    this.config = config;
    this.lang = resolveLang(config.lang || document.documentElement.lang || DEFAULT_LANG);
    this.api = new FormApi(config.apiUrl || window.url('api/send'));
    this.i18n = new I18n(config.messages || {}, this.lang);
    this.validator = new FormValidator(this.form, this.i18n);
    this.ui = new FormUI(formElement, this.i18n);
    this.mask = new PhoneMask(formElement.querySelector('input[name="phone"]'), this.lang, COUNTRY_CODES);
    this.isSubmitting = false;
    this.abortController = null;
    this._boundHandleSubmit = this._handleSubmit.bind(this);
    this._boundHandleInput = this._handleInput.bind(this);
    this._boundHandlePolicyChange = this._handlePolicyChange.bind(this);
    this._boundHandleFileChange = this._handleFileChange.bind(this);
  }

  init() {
    this.mask.init();
    this._setCurrentUrl();
    primeFormToken(this.form);
    this.form.addEventListener('submit', this._boundHandleSubmit);
    this.form.addEventListener('input', this._boundHandleInput);

    const policyField = this.form.querySelector('input[name="policy"]');
    if (policyField) {
      policyField.addEventListener('change', this._boundHandlePolicyChange);
    }

    // Обработка file-инпутов
    this.form.querySelectorAll('.form-callback__file-input').forEach((fileInput) => {
      fileInput.addEventListener('change', this._boundHandleFileChange);
    });

    this.form.dataset.callbackFormInitialized = '1';
  }

  destroy() {
    const policyField = this.form.querySelector('input[name="policy"]');
    if (policyField) {
      policyField.removeEventListener('change', this._boundHandlePolicyChange);
    }
    this.form.querySelectorAll('.form-callback__file-input').forEach((fileInput) => {
      fileInput.removeEventListener('change', this._boundHandleFileChange);
    });
    this.form.removeEventListener('submit', this._boundHandleSubmit);
    this.form.removeEventListener('input', this._boundHandleInput);
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.mask.destroy();
    delete this.form.dataset.callbackFormInitialized;
  }

  async _handleSubmit(e) {
    e.preventDefault();

    if (this.isSubmitting) {
      return;
    }

    this.ui.clearErrors();
    const validation = this.validator.validate();

    if (!validation.isValid) {
      Object.keys(validation.errors).forEach((fieldName) => {
        const field = this.form.querySelector(`[name="${fieldName}"]`);
        if (field) {
          const fieldToMark = fieldName === 'policy' ? field.closest('.form-callback__field') || field : field;
          this.ui.markFieldAsError(fieldToMark);
        }
      });
      this.ui.showFormError(
        validation.firstError || this.i18n.get('error', 'form_errors', DEFAULT_ERROR_TEXTS[this.lang].form_errors)
      );
      return;
    }

    this.isSubmitting = true;
    this.ui.setLoadingState();
    this.abortController = new AbortController();
    let hasSucceeded = false;

    try {
      this._setCurrentUrl();
      const formData = this._buildFormData();
      await ensureFormToken(formData, this.form);
      const response = await this._sendWithRetry(formData);

      if (response.processing === true) {
        this._handleSuccess(formData, {
          success: true,
          message: response.message || 'Заявка принята',
          request_id: response.requestId || '',
        });
        hasSucceeded = true;
        return;
      }

      this._handleSuccess(formData, response.raw);
      hasSucceeded = true;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }

      this._handleError(error);
    } finally {
      this.isSubmitting = false;
      if (!hasSucceeded) {
        this.ui.setErrorState();
      }
      this.abortController = null;
    }
  }

  _handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const field = target.closest(
      '.form-callback__control, .form-callback__file-input, .form-callback__checkbox-input, .form-callback__radio-input'
    );
    if (field) {
      this.ui.clearFieldError(field);
    }
  }

  _handlePolicyChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.checked) {
      const container = target.closest('.form-callback__field') || target;
      this.ui.clearFieldError(container);
    }
  }

  _handleFileChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
      return;
    }

    // Очищаем ошибку поля
    this.ui.clearFieldError(input);

    // Обновляем список файлов
    const fieldContainer = input.closest('.form-callback__field');
    const fileList = fieldContainer ? fieldContainer.querySelector('.js-file-list') : null;
    if (!fileList) {
      return;
    }

    fileList.textContent = '';

    if (!input.files || input.files.length === 0) {
      return;
    }

    Array.from(input.files).forEach((file) => {
      const item = document.createElement('span');
      item.className = 'form-callback__file-item';
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      item.textContent = `${file.name} (${sizeMb} МБ)`;
      fileList.appendChild(item);
    });
  }

  _setCurrentUrl() {
    const currentUrlField = this.form.querySelector('input[name="current_url"]');
    if (currentUrlField) {
      currentUrlField.value = window.location.href;
    }
  }

  /**
   * Заявка не должна теряться из-за нашей же защиты: если сервер не принял токен (вкладка
   * висела сутки, токен просрочен, ответ на выдачу не дошёл), берём свежий, выжидаем
   * положенный возраст и отправляем ещё раз. Ключ идемпотентности тот же, дубля не будет.
   */
  async _sendWithRetry(formData) {
    try {
      return await this.api.send(formData, this.abortController.signal);
    } catch (error) {
      if (!error || error.code !== 'TOKEN_INVALID') throw error;

      const token = await refreshFormToken();
      if (!token) throw error;

      formData.set('form_token', token);
      const wait = Number(error.retryAfter) > 0 ? Number(error.retryAfter) : 3;
      await new Promise((resolve) => setTimeout(resolve, (wait + 0.5) * 1000));
      return this.api.send(formData, this.abortController.signal);
    }
  }

  _buildFormData() {
    const formData = new FormData(this.form);
    const phoneField = this.form.querySelector('input[name="phone"]');
    if (phoneField) {
      formData.set('phone', normalizePhone(phoneField.value));
    }

    const policyField = this.form.querySelector('input[name="policy"]');
    formData.set('policy', policyField && policyField.checked ? 'on' : 'off');

    formData.set('lang', this.lang);

    const currentUrlField = this.form.querySelector('input[name="current_url"]');
    if (currentUrlField) {
      formData.set('current_url', currentUrlField.value || window.location.href);
    } else {
      formData.set('current_url', window.location.href);
    }

    return formData;
  }

  _handleSuccess(formData, rawResponse) {
    this.form.dispatchEvent(
      new CustomEvent('formSubmissionSuccess', {
        bubbles: true,
        detail: {
          form: this.form,
          formData,
          serverResponse: rawResponse,
        },
      })
    );

    this.form.reset();
    this.mask.reset();
    this.ui.clearErrors();
    this.ui.setSuccessState();
  }

  _handleError(error) {
    const firstServerError =
      error && error.errors && typeof error.errors === 'object' && Object.keys(error.errors).length > 0
        ? error.errors[Object.keys(error.errors)[0]]
        : '';

    if (error && error.errors && typeof error.errors === 'object') {
      Object.entries(error.errors).forEach(([fieldName]) => {
        const field = this.form.querySelector(`[name="${fieldName}"]`);
        if (field) {
          const fieldToMark = fieldName === 'policy' ? field.closest('.form-callback__field') || field : field;
          this.ui.markFieldAsError(fieldToMark);
        }
      });
    }

    const message =
      firstServerError ||
      (error && typeof error.message === 'string' && error.message) ||
      this.i18n.get('error', 'server_error', DEFAULT_ERROR_TEXTS[this.lang].server_error);

    this.ui.showFormError(message);
  }
}

export function initCallbackForms(root = document, globalData = window.globalData || {}) {
  const forms = root.querySelectorAll('.js-form-callback');
  if (!forms.length) {
    return [];
  }

  const lang = resolveLang(document.documentElement.lang || DEFAULT_LANG);
  const formCallbackData = globalData['form-callback'] || {};
  const apiUrl = typeof window.url === 'function' ? window.url('api/send') : '/api/send';

  const instances = [];
  forms.forEach((form) => {
    if (form.dataset.callbackFormInitialized === '1') {
      return;
    }
    const instance = new CallbackForm(form, {
      messages: formCallbackData,
      lang,
      apiUrl,
    });
    instance.init();
    instances.push(instance);
  });

  return instances;
}

function bootstrapCallbackForms() {
  if (typeof window.url !== 'function') {
    console.error('Критическая ошибка: функция window.url() не определена.');
    return;
  }

  const jsonUrl = window.url('data/json/global.json');
  fetch(jsonUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Ошибка загрузки global.json: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      window.globalData = data;
      initCallbackForms(document, data);
    })
    .catch(() => {
      initCallbackForms(document, {});
    });
}

window.initCallbackForms = initCallbackForms;
document.addEventListener('DOMContentLoaded', bootstrapCallbackForms);
