import { API_TIMEOUT_MS, UTM_KEYS } from './constants.js';

export class FormApi {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  static generateIdempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async send(formData, externalSignal) {
    if (!formData.has('idempotency_key')) {
      formData.set('idempotency_key', FormApi.generateIdempotencyKey());
    }

    this._appendUtmParams(formData);

    const sendUrl = this._buildSendUrl();
    const { signal, cleanup } = this._createTimeoutSignal(externalSignal, API_TIMEOUT_MS);

    try {
      const response = await fetch(sendUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
        signal,
      });

      const payload = await this._safeParseJson(response);
      const normalized = this._normalizeResponse(payload);

      if (!response.ok || normalized.success === false) {
        const error = new Error(normalized.message || 'Ошибка при отправке');
        error.code = normalized.code || 'SERVER_ERROR';
        error.errors = normalized.errors || {};
        error.status = response.status;
        error.requestId = normalized.requestId || null;
        throw error;
      }

      return normalized;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof Error && Object.prototype.hasOwnProperty.call(error, 'code')) {
        throw error;
      }

      const networkError = new Error('Ошибка соединения');
      networkError.code = 'NETWORK_ERROR';
      networkError.errors = {};
      networkError.status = 0;
      throw networkError;
    } finally {
      cleanup();
    }
  }

  _createTimeoutSignal(externalSignal, timeoutMs) {
    const timeoutController = new AbortController();
    const combinedController = new AbortController();

    const abortCombined = () => {
      if (!combinedController.signal.aborted) {
        combinedController.abort();
      }
    };

    const timerId = setTimeout(() => {
      timeoutController.abort();
      abortCombined();
    }, timeoutMs);

    timeoutController.signal.addEventListener('abort', abortCombined, { once: true });
    if (externalSignal) {
      externalSignal.addEventListener('abort', abortCombined, { once: true });
    }

    return {
      signal: combinedController.signal,
      cleanup: () => {
        clearTimeout(timerId);
      },
    };
  }

  async _safeParseJson(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        code: 'PARSE_ERROR',
        message: 'Некорректный ответ сервера',
      };
    }
  }

  _normalizeResponse(payload) {
    const data = payload && typeof payload === 'object' ? payload : {};

    return {
      success: typeof data.success === 'undefined' ? true : Boolean(data.success),
      message: typeof data.message === 'string' ? data.message : '',
      errors: data.errors && typeof data.errors === 'object' ? data.errors : {},
      code: typeof data.code === 'string' ? data.code : '',
      requestId: typeof data.request_id === 'string' ? data.request_id : '',
      processing: data.processing === true,
      raw: data,
    };
  }

  _appendUtmParams(formData) {
    const urlParams = new URLSearchParams(window.location.search);

    const hasUtmInUrl = UTM_KEYS.some((key) => {
      const value = urlParams.get(key);
      return typeof value === 'string' && value.trim() !== '';
    });

    const hasUtmSession = this._safeSessionGet('utm_session') === '1';

    if (!hasUtmSession && !hasUtmInUrl) {
      return;
    }

    UTM_KEYS.forEach((key) => {
      let value = this._safeSessionGet(key);

      if (!value) {
        value = urlParams.get(key) || '';
      }

      if (!value && window.utmHelper && typeof window.utmHelper.getCookie === 'function') {
        value = window.utmHelper.getCookie(key) || '';
      }

      if (value) {
        formData.set(key, value);
      }
    });

    formData.set('utm_session', '1');
  }

  _buildSendUrl() {
    const currentParams = new URLSearchParams(window.location.search);
    const utmQuery = new URLSearchParams();

    UTM_KEYS.forEach((key) => {
      const value = currentParams.get(key);
      if (value) {
        utmQuery.set(key, value);
      }
    });

    if ([...utmQuery.keys()].length === 0) {
      return this.baseUrl;
    }

    const joiner = this.baseUrl.includes('?') ? '&' : '?';
    return `${this.baseUrl}${joiner}${utmQuery.toString()}`;
  }

  _safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }
}
