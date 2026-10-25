import { FormApi } from './api.js';
import { createAbortController } from './abort.js';
import { primeFormToken, primeAllTokenFields, ensureFormToken, refreshFormToken } from './token.js';
import { formTitle } from './form-title.js';
import { dropAutofilledTraps } from './trap.js';
import {
  initCaptcha,
  appendCaptchaToken,
  captchaToken,
  hasLateCaptchaToken,
  lastCaptcha,
  captchaOnScreen,
} from './captcha.js';
import { FormChecker } from '../form-rules/dom.js';
import { PhoneMask } from './mask.js';
import { FormUI } from './ui.js';
import { I18n, resolveLang } from './i18n.js';
import { COUNTRY_CODES, DEFAULT_ERROR_TEXTS, DEFAULT_LANG, NETWORK_RETRY_MS } from './constants.js';
import { normalizePhone } from './validation.js';

export class CallbackForm {
  constructor(formElement, config = {}) {
    this.form = formElement;
    this.config = config;
    this.lang = resolveLang(config.lang || document.documentElement.lang || DEFAULT_LANG);
    this.api = new FormApi(config.apiUrl || window.url('api/send'));
    this.i18n = new I18n(config.messages || {}, this.lang);
    this.ui = new FormUI(formElement, this.i18n);
    // Тексты площадки из global.json → error.<lang> перекрывают тексты модуля по тем же ключам.
    const errorTexts = ((config.messages || {}).error || {})[this.lang] || {};
    this.checker = new FormChecker(formElement, {
      lang: this.lang,
      messages: errorTexts,
      onUpdate: (count, checker) => this.ui.updateSummary(count, checker.summary(count)),
    });
    this.mask = new PhoneMask(formElement.querySelector('input[name="phone"]'), this.lang, COUNTRY_CODES);
    this.isSubmitting = false;
    this.abortController = null;
    this.ui.onEditPhone = (shown) => this._editPhone(shown);
    this._boundHandleSubmit = this._handleSubmit.bind(this);
    this._boundHandleFileChange = this._handleFileChange.bind(this);
  }

  init() {
    this.mask.init();
    this._setCurrentUrl();
    primeFormToken(this.form);
    this.checker.init();
    this.form.addEventListener('submit', this._boundHandleSubmit);

    // Обработка file-инпутов
    this.form.querySelectorAll('.form-callback__file-input').forEach((fileInput) => {
      fileInput.addEventListener('change', this._boundHandleFileChange);
    });

    this.form.dataset.callbackFormInitialized = '1';
  }

  destroy() {
    this.checker.destroy();
    this.form.querySelectorAll('.form-callback__file-input').forEach((fileInput) => {
      fileInput.removeEventListener('change', this._boundHandleFileChange);
    });
    this.form.removeEventListener('submit', this._boundHandleSubmit);
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
    // Все ошибки сразу, каждая под своим полем; фокус — на первое. Плашка — только сводка,
    // когда ошибок больше одной: одну человек видит там, куда перевели фокус.
    const check = this.checker.run();
    if (check.errors.length) {
      this.ui.showSummary(check.summary);
      this._reportOutcome('validation_failed', check.errors[0].message, check.fields);
      return;
    }

    this.isSubmitting = true;
    // Хронология отправки для приёмника: без неё «отправлялось 15 секунд» не разложить на капчу,
    // сервер и повторы.
    this.timing = { started: performance.now(), steps: [] };
    this.ui.setLoadingState();
    this.abortController = createAbortController();
    let hasSucceeded = false;

    try {
      this._setCurrentUrl();
      const formData = this._buildFormData();
      // Ключ сессии формы от сниппета маячков: заявка и попытка сшиваются в приёмнике по нему.
      if (this.form.dataset.ismartSession) {
        formData.set('idempotency_key', this.form.dataset.ismartSession);
      }
      await ensureFormToken(formData, this.form);
      await appendCaptchaToken(formData, { late: () => this._submitWithLateCaptcha() });
      this._step('captcha', lastCaptcha());
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
        this._reportOutcome('network_error', 'timeout');
        if (this._showCaptchaPending()) return;
        // Без текста человек не понимает, ушла ли заявка, и уходит. Данные в форме остаются.
        this.ui.showFormError(
          this.i18n.get('error', 'connection_error', DEFAULT_ERROR_TEXTS[this.lang].connection_error),
          { withPhone: true }
        );
        this._retryIfLateCaptcha();
        return;
      }

      const status = error && typeof error.status === 'number' ? error.status : null;
      let outcome = 'js_error';
      if (status === 0) {
        outcome = 'network_error';
      } else if (status) {
        outcome = `http_${status}`;
      }
      const serverFields = error && error.errors && typeof error.errors === 'object' ? Object.keys(error.errors) : [];
      this._reportOutcome(outcome, (error && error.message) || '', serverFields);

      const captchaRelated = status === 0 || (error && error.code === 'CAPTCHA_INVALID');
      if (!(captchaRelated && this._showCaptchaPending())) this._handleError(error);
      if (captchaRelated) this._retryIfLateCaptcha();
    } finally {
      this.isSubmitting = false;
      if (hasSucceeded) {
        this._reportOutcome('sent');
      }
      if (!hasSucceeded) {
        this.ui.setErrorState();
      }
      this.abortController = null;
    }
  }

  /**
   * Исход попытки — сниппету маячков: он живёт отдельно от бандла и сам исхода не знает.
   * `fields` — какие поля не прошли проверку: по ним видно, на чём спотыкаются.
   */
  _reportOutcome(outcome, error = '', fields = []) {
    const detail = { outcome, error, fields };
    if (this.timing && outcome !== 'validation_failed') {
      detail.timing = { total_ms: Math.round(performance.now() - this.timing.started), steps: this.timing.steps };
    }
    this.form.dispatchEvent(new CustomEvent('ismart:send-result', { bubbles: true, detail }));
  }

  /** Шаг отправки в хронологию: капча (как прошла и сколько ждали) или запрос к серверу. */
  _step(kind, data) {
    if (this.timing && this.timing.steps.length < 8) this.timing.steps.push({ k: kind, ...data });
  }

  async _timedSend(formData) {
    const started = performance.now();
    try {
      const response = await this.api.send(formData, this.abortController.signal);
      this._step('send', { ms: Math.round(performance.now() - started), status: 200 });
      return response;
    } catch (error) {
      let status = error && typeof error.status === 'number' ? error.status : 0;
      if (error && error.name === 'AbortError') status = 'timeout';
      this._step('send', { ms: Math.round(performance.now() - started), status });
      throw error;
    }
  }

  _handleFileChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
      return;
    }

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

  _editPhone(shown) {
    const phone = this.form.querySelector('input[name="phone"]');
    if (!phone) return;
    phone.value = shown;
    // Маска пересчитает скрытые цифры по тому же вводу, что и при наборе руками.
    phone.dispatchEvent(new Event('input', { bubbles: true }));
    phone.focus();
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
      return await this._sendSurvivingBlip(formData);
    } catch (error) {
      if (error && error.code === 'CAPTCHA_INVALID') return this._resendWithFreshCaptcha(formData, error);
      if (!error || error.code !== 'TOKEN_INVALID') throw error;

      const token = await refreshFormToken();
      if (!token) throw error;

      formData.set('form_token', token);
      const wait = Number(error.retryAfter) > 0 ? Number(error.retryAfter) : 3;
      await new Promise((resolve) => setTimeout(resolve, (wait + 0.5) * 1000));
      return this._timedSend(formData);
    }
  }

  /**
   * Капча не успела: на подозрительной сессии (VPN, вкладка часами висела открытой) картинка
   * появляется позже тихого ожидания, и заявка ушла без её ответа. Сервер отказал — проверка
   * проходит заново, человек решает картинку, заявка уходит сама, данные в форме те же.
   * Ответа нет и теперь — показываем отказ сервера.
   */
  async _resendWithFreshCaptcha(formData, error) {
    const token = await captchaToken({ fresh: true, late: () => this._submitWithLateCaptcha() });
    this._step('captcha', lastCaptcha());
    if (!token) throw error;
    formData.set('smart-token', token);
    return this._timedSend(formData);
  }

  /**
   * Картинку капчи человек решил, когда форма уже показала ошибку (ответ опоздал, или связь
   * подвисла и запрос оборвался по тайм-ауту). Ошибка не должна оставаться: заявка уходит сама,
   * с этим ответом — captchaToken отдаст его первым. Отправленную или уходящую форму не трогаем.
   */
  /** Окно капчи ещё на экране — просим пройти проверку вместо ошибки; ответ отправит заявку сам. */
  _showCaptchaPending() {
    if (!captchaOnScreen()) return false;
    this.ui.showFormError(this.i18n.get('error', 'captcha_pending', DEFAULT_ERROR_TEXTS[this.lang].captcha_pending));
    return true;
  }

  /** Ответ капчи пришёл, пока висел оборвавшийся запрос, — сразу ещё раз, уже с ним. */
  _retryIfLateCaptcha() {
    if (hasLateCaptchaToken()) setTimeout(() => this._submitWithLateCaptcha(), 0);
  }

  _submitWithLateCaptcha() {
    if (this.isSubmitting || this.form.classList.contains('is-success') || !this.form.isConnected) return;
    if (this.ui.bannerMode !== 'form') return;
    this._handleSubmit({ preventDefault() {} });
  }

  /**
   * Обрыв связи на мобильном часто длится секунду — переход между вышками, лифт. Один повтор
   * через NETWORK_RETRY_MS с тем же ключом идемпотентности безопасен: если первый запрос всё же
   * дошёл и потерялся только ответ, сервер вернёт сохранённый результат, а не вторую заявку.
   */
  async _sendSurvivingBlip(formData) {
    try {
      return await this._timedSend(formData);
    } catch (error) {
      if (!error || error.code !== 'NETWORK_ERROR') throw error;
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_MS));
      return this._timedSend(formData);
    }
  }

  /**
   * Связи нет и после повтора. Данные остаются в форме; без интернета говорим прямо, а когда он
   * вернётся — подсказываем отправить ещё раз. Если человек уйдёт, номер уже у приёмника
   * через маячок: досыльщик доведёт его до кабинета сам.
   */
  _handleNetworkError() {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const key = offline ? 'offline' : 'connection_error';
    this.ui.showFormError(this.i18n.get('error', key, DEFAULT_ERROR_TEXTS[this.lang][key]), { withPhone: true });
    if (!offline || this._waitingOnline) return;
    this._waitingOnline = true;
    window.addEventListener(
      'online',
      () => {
        this._waitingOnline = false;
        if (this.isSubmitting || this.ui.bannerMode !== 'form') return;
        this.ui.showFormError(this.i18n.get('error', 'online_again', DEFAULT_ERROR_TEXTS[this.lang].online_again));
      },
      { once: true }
    );
  }

  _buildFormData() {
    const formData = new FormData(this.form);
    // Ловушку, которую вписало автозаполнение браузера, не отправляем: иначе сервер молча
    // отбросит заявку живого человека (trap.js).
    dropAutofilledTraps(this.form, formData);
    const phoneField = this.form.querySelector('input[name="phone"]');
    if (phoneField) {
      // Номер берём из скрытого поля, которое ведёт маска: там цифры, посчитанные из того же
      // ввода, что и показанный формат. Разбирать показанное второй раз на сервере — значит
      // держать второй разборщик, который рано или поздно разойдётся с первым.
      const digits = String(formData.get('phone_digits') || '');
      formData.set('phone', digits || normalizePhone(phoneField.value));
      // Показанное едет рядом и дальше приёмника не идёт: по расхождению с цифрами видно,
      // что поле меняли мимо маски, — иначе про такое узнаёшь от заказчика.
      formData.set('phone_shown', phoneField.value);
      formData.delete('phone_digits');
    }

    // Галки едут явным on/off: неотмеченный чекбокс FormData пропускает, и сервер не отличил
    // бы «не поставил» от «в форме такой нет». Шлём только те, что в форме есть, — иначе форма
    // без галки получала policy=off и отказ сервера.
    this.form.querySelectorAll('input[type="checkbox"][name]').forEach((box) => {
      if (this.form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(box.name)}"]`).length > 1) return;
      formData.set(box.name, box.checked ? 'on' : 'off');
    });

    // Форму могли открыть не кнопкой — тогда названия неоткуда взяться, и в заявке остаётся
    // пустая графа. Подставляем то, что видит человек: заголовок модалки или секции.
    const named = ['form_name', 'source', 'subject'].some((key) => {
      const value = formData.get(key);
      return typeof value === 'string' && value.trim() !== '';
    });
    if (!named) {
      const title = formTitle(this.form);
      if (title) formData.set('form_name', title);
    }

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
    this.checker.reset();
    this.ui.clearErrors();
    this.ui.setSuccessState(String(formData.get('phone_shown') || ''));
  }

  _handleError(error) {
    if (error && error.code === 'NETWORK_ERROR') {
      this._handleNetworkError();
      return;
    }

    // Ошибки сервера по полям — в те же места, что ошибки фронта. В плашку идёт только то,
    // чему в форме места нет, и сводка, если полей с ошибкой несколько.
    if (error && error.errors && typeof error.errors === 'object' && Object.keys(error.errors).length > 0) {
      const orphans = this.checker.showServerErrors(error.errors);
      const summary = this.checker.summary(this.checker.errorCount);
      if (orphans.length) {
        // Отказ по полю, которого в форме нет, человеку не исправить: текст сервера про чужое
        // поле ему ничего не скажет. Говорим, что делать, — повторить или позвонить; сам текст
        // уходит в маячок вместе с исходом (fields), по нему и разбираемся.
        this.ui.showFormError(this.i18n.get('error', 'server_error', DEFAULT_ERROR_TEXTS[this.lang].server_error), {
          withPhone: true,
        });
      } else if (summary) {
        this.ui.showSummary(summary);
      }
      return;
    }

    const message =
      (error && typeof error.message === 'string' && error.message) ||
      this.i18n.get('error', 'server_error', DEFAULT_ERROR_TEXTS[this.lang].server_error);

    this.ui.showFormError(message, { withPhone: true });
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
primeAllTokenFields();
initCaptcha();
document.addEventListener('DOMContentLoaded', bootstrapCallbackForms);
