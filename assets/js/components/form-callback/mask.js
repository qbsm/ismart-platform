// Маска телефона. Разбор подхода и причины решений — docs.ismart.pro/ismart-platform.

const MASKS = {
  RU: '+7 (999) 999-99-99',
};

const DEFAULT_COUNTRY = 'RU';
// Код страны из поля не убирается: стерев всё, человек видит «+7 » и продолжает набор с той
// же точки, а не с пустого места. Так ведут себя формы, у которых номер вводят чаще всего.
const TRUNK = '+7 ';
const PREFIX_RE = /^(\+\s*7|8|7)/;
const DIGIT_SLOT = /9/g;

function nationalDigits(raw) {
  const slots = (MASKS[DEFAULT_COUNTRY].match(DIGIT_SLOT) || []).length;
  let digits = String(raw || '').replace(PREFIX_RE, '').replace(/\D+/g, '');

  // Якорь снимает код только в начале строки, а он туда попадает не всегда: при вставке в поле
  // с готовым «+7 (» код страны идёт следом за префиксом. Лишние ведущие цифры отбрасываем по
  // длине — национальный номер занимает ровно слоты маски.
  while (digits.length > slots && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, slots);
}

function formatPhone(raw) {
  const digits = nationalDigits(raw);
  if (!digits) return '';

  let index = 0;
  let out = '';
  for (const ch of MASKS[DEFAULT_COUNTRY]) {
    if (ch !== '9') {
      out += ch;
      continue;
    }
    if (index >= digits.length) break;
    out += digits[index++];
  }

  return out.replace(/[\s()-]+$/, '');
}

export function phoneDigits(value) {
  const digits = nationalDigits(value);
  return digits ? `7${digits}` : '';
}

export class PhoneMask {
  constructor(inputElement) {
    this.input = inputElement;
    this._onInput = this._handleInput.bind(this);
    this._onFocus = this._handleFocus.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onCaret = this._guardCaret.bind(this);
    this._onChange = this._syncDigits.bind(this);
    this._onSubmit = this._handleSubmit.bind(this);
  }

  init() {
    if (!this.input) return;
    this.input.setAttribute('inputmode', 'tel');
    this._ensureDigitsField();
    this.input.addEventListener('input', this._onInput);
    this.input.addEventListener('focus', this._onFocus);
    this.input.addEventListener('blur', this._onBlur);
    this.input.addEventListener('click', this._onCaret);
    this.input.addEventListener('keyup', this._onCaret);
    // Автозаполнение не всегда доходит до `input`: Chrome не шлёт его для своих подсказок,
    // Safari шлёт недоверенное событие. Поэтому цифры пересчитываем ещё и на `change`, и
    // перед самой отправкой — в фазе перехвата на документе, то есть раньше любого
    // обработчика формы. Иначе на сервер уехали бы цифры, отставшие от показанного.
    this.input.addEventListener('change', this._onChange);
    document.addEventListener('submit', this._onSubmit, true);
    if (this.input.value) this._handleInput();
    this._syncDigits();
  }

  /**
   * Скрытое поле с чистыми цифрами рядом с видимым.
   *
   * Отображаемое значение — это то, что нарисовала маска, и разбирать его на сервере обратно
   * значит держать второй разборщик: пока они согласны, это незаметно, а разойдясь они молча
   * меняют номер в заявке. Цифры считаются из того же ввода, что и формат, и уходят отдельным
   * полем — обработчик берёт номер из него.
   */
  _ensureDigitsField() {
    const form = this.input.form;
    if (!form) return;
    let field = form.querySelector('input[name="phone_digits"]');
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'phone_digits';
      form.appendChild(field);
    }
    this.digitsField = field;
  }

  _syncDigits() {
    this.lastDigits = phoneDigits(this.input.value);
    if (this.digitsField) this.digitsField.value = this.lastDigits;
  }

  _handleSubmit(event) {
    if (event.target === this.input.form) this._syncDigits();
  }

  destroy() {
    if (!this.input) return;
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('focus', this._onFocus);
    this.input.removeEventListener('blur', this._onBlur);
    this.input.removeEventListener('click', this._onCaret);
    this.input.removeEventListener('keyup', this._onCaret);
    this.input.removeEventListener('change', this._onChange);
    document.removeEventListener('submit', this._onSubmit, true);
  }

  reset() {
    if (this.input) this.input.value = '';
  }

  /**
   * Позиция каретки в цифрах, а не в символах.
   *
   * Разделители маски при переформатировании съезжают, поэтому запоминать индекс в строке
   * бессмысленно: после правки в середине он указывает уже на другое место. Считаем, сколько
   * цифр стоит левее каретки, — это число переживает любое переформатирование.
   */
  static _digitsBefore(value, caret) {
    let digits = 0;
    for (let i = 0; i < caret && i < value.length; i += 1) {
      if (value[i] >= '0' && value[i] <= '9') digits += 1;
    }
    return digits;
  }

  /** Ближайшая цифра справа: за ней каретке и место, когда слева от неё разделитель. */
  static _nextDigitPos(value, from) {
    for (let i = Math.max(from, 0); i < value.length; i += 1) {
      if (value[i] >= '0' && value[i] <= '9') return i;
    }
    return value.length;
  }

  /** Обратный перевод: позиция в строке, левее которой стоит ровно столько цифр. */
  static _caretAfterDigits(value, digits) {
    if (digits <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] >= '0' && value[i] <= '9') {
        seen += 1;
        if (seen === digits) return i + 1;
      }
    }
    return value.length;
  }

  _handleInput(event) {
    const before = this.input.value;
    const caret = this.input.selectionStart;
    const previous = this.lastDigits;
    const formatted = formatPhone(before) || TRUNK;

    // Цифры обновляем до выхода: когда символ встал ровно по маске, переформатировать нечего,
    // и на этой ветке скрытое поле осталось бы на цифру позади показанного.
    this._syncDigits();
    if (formatted === before) return;

    // Присваивание value уносит каретку в конец, поэтому возвращаем её сами — и делаем это
    // всегда, а не только когда правили в конце строки. Иначе следующий символ уходит не туда
    // и цифры перемешиваются: человек правит третью цифру, а получает другой номер.
    const digitsLeft = PhoneMask._digitsBefore(before, caret);
    this.input.value = formatted;

    let pos = Math.max(TRUNK.length, PhoneMask._caretAfterDigits(formatted, digitsLeft));

    // Delete через разделитель: цифр не убавилось — значит стёрли скобку или дефис, а маска
    // вернула их на место. Оставить каретку где была значит запереть человека: сколько ни жми
    // Delete, номер не изменится. Переносим её к следующей цифре — приём из maskito, который
    // на такой же случай двигает каретку за неизменяемый символ.
    if (event && event.inputType === 'deleteContentForward' && this.lastDigits === previous) {
      pos = PhoneMask._nextDigitPos(formatted, pos);
    }

    this._setCaret(pos);
  }

  /**
   * Каретку ставим дважды: сразу и следующим кадром. Мобильные браузеры после программной
   * замены значения возвращают её в конец уже после нашего вызова.
   */
  _setCaret(pos) {
    const place = () => {
      try {
        const limit = this.input.value.length;
        const at = Math.min(pos, limit);
        this.input.setSelectionRange(at, at);
      } catch {
        // поле уже потеряло фокус — ставить нечего
      }
    };
    place();
    requestAnimationFrame(place);
  }

  _handleFocus() {
    if (!this.input.value) this.input.value = TRUNK;
    // Каретку ставим после отрисовки: браузер обрабатывает клик по полю уже после focus и
    // иначе возвращает её туда, куда пришёлся клик, — то есть перед «+7».
    this._caretToEnd();
  }

  _caretToEnd() {
    this._setCaret(this.input.value.length);
  }

  /** Внутрь «+7 » каретке делать нечего: там нечего править. Выделение не трогаем. */
  _guardCaret() {
    const { selectionStart, selectionEnd, value } = this.input;
    if (selectionStart !== selectionEnd || selectionStart >= TRUNK.length) return;
    const pos = Math.max(TRUNK.length, Math.min(selectionStart, value.length));
    this.input.setSelectionRange(pos, pos);
  }

  /**
   * Поле, покинутое без единой цифры, очищаем полностью: иначе плавающая подпись остаётся
   * поднятой и форма выглядит начатой, хотя телефона в ней нет.
   */
  _handleBlur() {
    if (nationalDigits(this.input.value).length === 0) this.input.value = '';
    this._syncDigits();
  }
}
