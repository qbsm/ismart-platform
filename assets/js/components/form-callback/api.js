import { AD_KEYS, API_TIMEOUT_MS, UTM_KEYS } from './constants.js';

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

    this._appendAnalytics(formData);

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
        error.retryAfter = normalized.retryAfter;
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
      retryAfter: typeof data.retry_after === 'number' ? data.retry_after : undefined,
      processing: data.processing === true,
      raw: data,
    };
  }

  _appendAnalytics(formData) {
    const urlParams = new URLSearchParams(window.location.search);
    const helper = window.utmHelper;
    const cookie = (name) => (helper && typeof helper.getCookie === 'function' ? helper.getCookie(name) || '' : '');

    // Метка берётся и из живой куки, а не только из текущей сессии: реклама привела человека
    // на прошлой неделе, заявку он оставил сегодня — источник у неё тот же, не прямой заход.
    UTM_KEYS.forEach((key) => {
      const value = urlParams.get(key) || this._safeSessionGet(key) || cookie(key);
      if (value) {
        formData.set(key, value);
      }
    });

    AD_KEYS.forEach((key) => {
      const value = urlParams.get(key) || cookie(key);
      if (value) {
        formData.set(key, value);
      }
    });

    if (document.referrer) {
      formData.set('referrer', document.referrer);
    }

    const ymUid = cookie('_ym_uid');
    if (ymUid) {
      formData.set('ym_uid', ymUid);
    }

    const first = helper && typeof helper.getFirstTouch === 'function' ? helper.getFirstTouch() : {};
    const firstMap = {
      first_utm_source: first.utm_source,
      first_utm_medium: first.utm_medium,
      first_utm_campaign: first.utm_campaign,
      landing_page: first.landing,
      first_referrer: first.referrer,
    };
    Object.entries(firstMap).forEach(([key, value]) => {
      if (value) {
        formData.set(key, value);
      }
    });
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
