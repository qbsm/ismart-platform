import { DEFAULT_ERROR_TEXTS, LOADER_DELAY_MS, LOADER_SLOW_MS } from './constants.js';

export class FormUI {
  constructor(formElement, i18n) {
    this.form = formElement;
    this.i18n = i18n;
    this.submitButton = formElement.querySelector('.form-callback__submit');
    this.errorContainer = this._resolveErrorContainer();
    this.errorMessageNode = this.errorContainer
      ? this.errorContainer.querySelector('.form-callback__error-text')
      : null;
    this.originalButtonNodes = this.submitButton
      ? Array.from(this.submitButton.childNodes).map((node) => node.cloneNode(true))
      : [];
    this.restoreTimer = null;
    this.successOverlay = null;
    this.bannerMode = null;
    this.loadingTimers = [];
    const lang = i18n.lang || 'ru';
    this.defaults = DEFAULT_ERROR_TEXTS[lang] || DEFAULT_ERROR_TEXTS.ru;
  }

  /**
   * Отправка началась (proposal 0025). Клик принят сразу — форма помечена занятой, — а
   * спиннер и «Отправляем…» появляются только через LOADER_DELAY_MS: быстрый ответ не должен
   * мигать лоадером. Долгий ответ меняет текст, чтобы человек не решил, что всё зависло.
   */
  setLoadingState() {
    if (!this.submitButton) {
      return;
    }

    this._clearRestoreTimer();
    this._clearLoadingTimers();
    // Ширина фиксируется: текст «Отправляем…» другой длины, и кнопка в строке не должна прыгать.
    this.submitButton.style.minWidth = `${this.submitButton.offsetWidth}px`;
    // Не disabled: такая кнопка теряет фокус и красится «неактивной», будто нажимать было нельзя.
    // Повторные нажатия и так гасит isSubmitting в форме.
    this.submitButton.setAttribute('aria-disabled', 'true');
    this.form.setAttribute('aria-busy', 'true');
    this.loadingTimers = [
      setTimeout(() => {
        this.submitButton.classList.add('loading');
        this.form.classList.add('is-loading');
        this._setButtonText(this.i18n.get('error', 'sending', this.defaults.sending));
      }, LOADER_DELAY_MS),
      setTimeout(() => {
        this._setButtonText(this.i18n.get('error', 'sending_slow', this.defaults.sending_slow));
      }, LOADER_SLOW_MS),
    ];
  }

  _setButtonText(text) {
    const textEl = this.submitButton && this.submitButton.querySelector('.form-callback__submit-text');
    if (!textEl || !text) {
      return;
    }
    if (!textEl.dataset.originalText) {
      textEl.dataset.originalText = textEl.textContent;
    }
    textEl.textContent = text;
  }

  _clearLoadingTimers() {
    (this.loadingTimers || []).forEach((t) => clearTimeout(t));
    this.loadingTimers = [];
  }

  setSuccessState(phoneShown = '') {
    if (!this.submitButton) {
      return;
    }

    this._clearLoadingTimers();
    this.submitButton.removeAttribute('aria-disabled');
    this.submitButton.classList.remove('loading');
    this.submitButton.style.minWidth = '';
    this.form.classList.remove('is-loading');
    this.form.removeAttribute('aria-busy');
    this.form.classList.add('is-success');

    this._showSuccessOverlay(phoneShown);
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
    this._clearLoadingTimers();
    this.submitButton.removeAttribute('aria-disabled');
    this.submitButton.classList.remove('loading');
    this.submitButton.style.minWidth = '';
    this.form.classList.remove('is-loading');
    this.form.removeAttribute('aria-busy');

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

  /**
   * Ошибка всей формы: нет сети, отказ сервера, поле, которого в форме нет. Ошибки полей
   * сюда не пишем — они стоят под своими полями (FormChecker).
   */
  showFormError(message, { withPhone = false } = {}) {
    if (!this.errorContainer || !this.errorMessageNode) {
      return;
    }

    this.bannerMode = 'form';
    this.errorMessageNode.textContent = message;
    // Заявка не ушла — даём другой путь, пока человек не закрыл страницу. Номер берём со
    // страницы: он и так стоит в шапке или контактах, отдельной настройки не нужно.
    const phone = withPhone ? this._pagePhone() : null;
    if (phone) {
      this.errorMessageNode.append(` ${this.i18n.get('error', 'call_us', this.defaults.call_us)} `, phone);
    }
    this.errorContainer.classList.remove('hidden');
    this.errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Сводка «Исправьте поля: N» — только когда полей с ошибкой больше одного. Не прокручиваем:
   * фокус уже стоит на первом поле с ошибкой, плашку нужно лишь объявить скринридеру.
   */
  showSummary(text) {
    if (!this.errorContainer || !this.errorMessageNode || !text) {
      return;
    }

    this.bannerMode = 'summary';
    this.errorMessageNode.textContent = text;
    this.errorContainer.classList.remove('hidden');
  }

  /** Человек исправляет поля: сводка пересчитывается и гаснет, когда ошибок меньше двух. */
  updateSummary(count, text) {
    if (this.bannerMode !== 'summary') {
      return;
    }
    if (count > 1 && text) {
      this.errorMessageNode.textContent = text;
      return;
    }
    this._hideBanner();
  }

  _hideBanner() {
    this.bannerMode = null;
    if (this.errorContainer) {
      this.errorContainer.classList.add('hidden');
    }
    if (this.errorMessageNode) {
      this.errorMessageNode.textContent = '';
    }
  }

  /** Плашку перед новой попыткой. Ошибки полей снимает FormChecker. */
  clearErrors() {
    this._hideBanner();
  }

  _showSuccessOverlay(phoneShown = '') {
    if (this.successOverlay) {
      this.successOverlay.remove();
    }

    const successTitle = this.i18n.get('error', 'success_title', 'Спасибо за заявку!');
    // Номер, на который перезвонят, — полностью: по нему человек замечает опечатку, пока не ушёл.
    const successText = phoneShown
      ? this.i18n.get('error', 'success_text_phone', this.defaults.success_text_phone).replace('{phone}', phoneShown)
      : this.i18n.get('error', 'success_text', this.defaults.success_text);

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

    // Статус, а не alert: успех не требует действия (WCAG 4.1.3). Фокус — на сообщение, иначе
    // он остаётся на кнопке под оверлеем, и скринридер молчит.
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('tabindex', '-1');
    overlay.style.cursor = 'pointer';
    overlay.addEventListener('click', () => {
      this._hideSuccessOverlay();
      this.restoreButton();
    });

    // Опечатку в номере видно только сейчас: даём вернуться к форме с этим же номером, а не
    // к пустой. Повторная отправка — новая заявка, старую с неверным номером менеджер отсеет.
    if (phoneShown && typeof this.onEditPhone === 'function') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'form-callback__success-edit';
      edit.textContent = this.i18n.get('error', 'success_edit', this.defaults.success_edit);
      edit.addEventListener('click', (event) => {
        event.stopPropagation();
        this._hideSuccessOverlay();
        this.restoreButton();
        this.onEditPhone(phoneShown);
      });
      overlay.appendChild(edit);
    }

    this.form.appendChild(overlay);
    this.successOverlay = overlay;
    void overlay.offsetHeight;
    overlay.focus({ preventScroll: true });
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

  _pagePhone() {
    const link = Array.from(document.querySelectorAll('a[href^="tel:"]')).find((a) => !this.form.contains(a));
    if (!link) {
      return null;
    }
    const copy = document.createElement('a');
    copy.href = link.getAttribute('href');
    copy.textContent = (link.textContent || '').replace(/\s+/g, ' ').trim() || copy.href.replace('tel:', '');
    return copy;
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
    container.className = 'form-callback__field field-full form-callback__error-banner hidden';
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
