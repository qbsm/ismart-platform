import { DEFAULT_ERROR_TEXTS } from './constants.js';

export class FormUI {
  constructor(formElement, i18n) {
    this.form = formElement;
    this.i18n = i18n;
    this.submitButton = formElement.querySelector('.form-callback__submit');
    this.errorContainer = this._resolveErrorContainer();
    this.errorMessageNode = this.errorContainer
      ? this.errorContainer.querySelector('.form-callback__error-text')
      : null;
    this.errorId = this.errorMessageNode ? this.errorMessageNode.id : '';
    this.originalButtonNodes = this.submitButton
      ? Array.from(this.submitButton.childNodes).map((node) => node.cloneNode(true))
      : [];
    this.restoreTimer = null;
    this.successOverlay = null;
    const lang = i18n.lang || 'ru';
    this.defaults = DEFAULT_ERROR_TEXTS[lang] || DEFAULT_ERROR_TEXTS.ru;
  }

  setLoadingState() {
    if (!this.submitButton) {
      return;
    }

    this._clearRestoreTimer();
    this.submitButton.disabled = true;
    this.submitButton.classList.add('loading');
    this.form.classList.add('is-loading');
  }

  setSuccessState() {
    if (!this.submitButton) {
      return;
    }

    this.submitButton.disabled = false;
    this.submitButton.classList.remove('loading');
    this.form.classList.remove('is-loading');
    this.form.classList.add('is-success');

    this._showSuccessOverlay();
  }

  setErrorState() {
    this.form.classList.remove('is-loading');
    this.restoreButton();
  }

  restoreButton() {
    if (!this.submitButton) {
      return;
    }

    this._clearRestoreTimer();
    this.submitButton.disabled = false;
    this.submitButton.classList.remove('loading');
    this.form.classList.remove('is-loading');

    const textEl = this.submitButton.querySelector('.form-callback__submit-text');
    if (textEl && textEl.dataset.originalText) {
      textEl.textContent = textEl.dataset.originalText;
      delete textEl.dataset.originalText;
    }

    const iconEl = this.submitButton.querySelector('.form-callback__submit-icon');
    if (iconEl) {
      iconEl.style.display = '';
    }

    if (!this.submitButton.querySelector('.form-callback__submit-text')) {
      this.submitButton.textContent = '';
      this.originalButtonNodes.forEach((node) => {
        this.submitButton.appendChild(node.cloneNode(true));
      });
    }
  }

  markFieldAsError(field) {
    const container = field.closest('.form-callback__field') || field;
    container.classList.add('error');

    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      field.setAttribute('aria-invalid', 'true');
      if (this.errorId) {
        field.setAttribute('aria-describedby', this.errorId);
      }
    }
  }

  clearFieldError(field) {
    const container = field.closest('.form-callback__field') || field;
    container.classList.remove('error');

    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      field.removeAttribute('aria-invalid');
      if (this.errorId && field.getAttribute('aria-describedby') === this.errorId) {
        field.removeAttribute('aria-describedby');
      }
    }

    const hasErrors = this.form.querySelector('.form-callback__field.error');
    if (!hasErrors && this.errorContainer) {
      this.errorContainer.classList.add('hidden');
      if (this.errorMessageNode) {
        this.errorMessageNode.textContent = '';
      }
    }
  }

  showFormError(message) {
    if (!this.errorContainer || !this.errorMessageNode) {
      return;
    }

    this.errorMessageNode.textContent = message;
    this.errorContainer.classList.remove('hidden');
    this.errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  clearErrors() {
    this.form.querySelectorAll('.form-callback__field.error').forEach((element) => element.classList.remove('error'));

    this.form.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
      element.removeAttribute('aria-invalid');
      if (this.errorId && element.getAttribute('aria-describedby') === this.errorId) {
        element.removeAttribute('aria-describedby');
      }
    });

    if (this.errorContainer) {
      this.errorContainer.classList.add('hidden');
    }
    if (this.errorMessageNode) {
      this.errorMessageNode.textContent = '';
    }
  }

  _showSuccessOverlay() {
    if (this.successOverlay) {
      this.successOverlay.remove();
    }

    const successTitle = this.i18n.get('error', 'success_title', 'Спасибо за заявку!');
    const successText = this.i18n.get('error', 'success_text', 'Мы свяжемся с вами в ближайшее время');

    const overlay = document.createElement('div');
    overlay.className = 'form-callback__success';
    overlay.innerHTML =
      '<span class="form-callback__success-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '</span>' +
      '<span class="form-callback__success-title">' +
      this._escapeHtml(successTitle) +
      '</span>' +
      '<span class="form-callback__success-text">' +
      this._escapeHtml(successText) +
      '</span>';

    overlay.style.cursor = 'pointer';
    overlay.addEventListener('click', () => {
      this._hideSuccessOverlay();
      this.restoreButton();
    });

    this.form.appendChild(overlay);
    this.successOverlay = overlay;
    void overlay.offsetHeight;
  }

  _hideSuccessOverlay() {
    this.form.classList.remove('is-success');

    if (this.successOverlay) {
      this.successOverlay.style.opacity = '0';
      this.successOverlay.style.transform = 'scale(0.95)';
      const el = this.successOverlay;
      setTimeout(() => el.remove(), 500);
      this.successOverlay = null;
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _resolveErrorContainer() {
    let container = this.form.querySelector('.form-callback__error-banner');
    if (container) {
      return container;
    }

    container = document.createElement('div');
    container.className = 'form-callback__field form-callback__field--full form-callback__error-banner hidden';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    const span = document.createElement('span');
    span.className = 'form-callback__error-text';
    span.setAttribute('role', 'alert');
    span.setAttribute('aria-live', 'assertive');
    container.appendChild(span);

    const grid = this.form.querySelector('.form-callback__grid') || this.form;
    grid.appendChild(container);

    return container;
  }

  _clearRestoreTimer() {
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }
}
