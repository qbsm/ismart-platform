# Рефакторинг форм обратной связи (form-callback)

Полный рерайт с нуля по best practice. Без оглядки на legacy.

---

## 1. Карта текущей функциональности

Полный аудит `form-callback.js` (1001 строка) и связанных файлов.

### 1.1. Инициализация (строки 1-60)

| # | Что делает | Как | Проблема |
|---|-----------|-----|----------|
| 1 | `DOMContentLoaded` | Один обработчик, всё внутри замыкания | Нет экспорта для динамических форм |
| 2 | Проверка `window.url()` | `typeof window.url !== 'function'` → `return` | Корректно |
| 3 | Загрузка `global.json` | `fetch(window.url('data/json/global.json'))` → `window.globalData` | При ошибке — формы НЕ инициализируются (мёртвая форма) |
| 4 | `initFormCallbacks()` | `querySelectorAll('.form-callback')` → `loadCountryCodes` → `initForm` для каждой | Корректно |

### 1.2. Загрузка кодов стран (строки 62-113)

- **RU-язык**: инлайн-объект из 16 стран (RU, BY, UA, US, GB, DE, FR, IT, ES, CN, IN, JP, TR, UZ, AZ, TJ, KG, GE, AM).
- **Другие языки**: `fetch('assets/js/data/country-codes.json')`. Файл **не существует** в репо.
- Формат: `{ "7": { code: "+7", country: "ru", format: "russia", name: "Россия, Казахстан" } }`.
- Поле `format` — одно из: `russia`, `north-america`, `standard`.

### 1.3. initForm — инициализация каждой формы (строки 115-181)

| # | Действие | Детали |
|---|---------|--------|
| 1 | Найти `button[type="submit"]` | Если нет — `return` |
| 2 | Заполнить `input[name="current_url"]` | `window.location.href` |
| 3 | Создать `.form-callback__error` | Если контейнера нет в DOM — создать `<div>` с `<span>` перед кнопкой |
| 4 | **Обработчик submit** | `submitButton.addEventListener('click', ...)` ← **БАГ**: не работает Enter в поле |
| 5 | Снятие ошибок при `input` | На полях name/phone/square/email: убрать `.error` с `.form-callback__item`, скрыть контейнер если ошибок больше нет |
| 6 | Снятие ошибок при `change` | На чекбоксе policy: аналогично |
| 7 | `initPhoneMask(form, countryCodes)` | Вся логика маски телефона |

### 1.4. Маска телефона (строки 183-400) — 220 строк

**Функции:**
- `formatPhoneNumber(value, format, countryCode)` — форматирование по 3 шаблонам:
  - `russia`: `+7 (999) 123-45-67`
  - `north-america`: `+1 (999) 123-4567`
  - `standard`: `+XX XX-XXX-XXXX`
- `detectCountryCode(digits)` — поиск в словаре по первым 1-4 цифрам (длинные коды приоритетнее).

**Обработчики:**
- `focus`: пустое поле → вставить дефолтный код по языку (RU→+7, EN→+1, DE→+49). Если значение содержит `@` — парсить как телефон.
- `blur`: если введён только код страны (без номера) — очистить поле и data-атрибуты.
- `input`: определить страну по цифрам → отформатировать → записать в value. **БАГ**: `this.value = formattedNumber` сбрасывает курсор в конец.
- `change`: обработка вставки/автозаполнения. Конвертация 8XXXXXXXXXX/9XXXXXXXXX → 7XXXXXXXXXX (российские номера).
- `setTimeout(500ms)`: обработка предзаполненных значений.
- `animationstart`: детектирование автозаполнения браузером (Chrome autofill animation).

**data-атрибуты на input:**
- `data-country-code` — например `+7`
- `data-detected-format` — например `russia`

### 1.5. Видимость полей (строки 402-423)

`isFieldVisible(field)` — проверяет `.form-callback__item`:
- `display: none` → false
- `visibility: hidden` → false
- `opacity: 0` → false
- Если нет `.form-callback__item` — считает видимым.

### 1.6. Валидация (строки 425-531)

| Поле | Условие проверки | Правила | Дефолтная ошибка |
|------|-----------------|---------|------------------|
| `phone` | Всегда | Обязательный. Если есть `data-country-code` — цифр ≥ (код + 5). Иначе — цифр ≥ 7. | «Укажите телефон» / «Неверный телефон» |
| `name` | `isFieldVisible()` | Обязательный, мин. 2 символа. | «Укажите имя» / «Имя от 2 символов» |
| `square` | `isFieldVisible()` | Обязательный. | «Укажите площадь» |
| `email` | Если есть значение | Регулярка `^[^\s@]+@[^\s@]+\.[^\s@]+$` | «Неверный E-mail» |
| `policy` | `isFieldVisible()` | `checked === true` | «Согласитесь с политикой» |

**Вспомогательные функции:**
- `markFieldAsError(field)` — добавляет `.error` на `.form-callback__item`.
- `showFormError(form, message)` — текст в `<span>` контейнера ошибок, убирает `.hidden`, `scrollIntoView({block: 'center'})`.
- `clearErrors(form)` — убирает все `.error`, скрывает контейнер.

**i18n:** `getLocalizedText('error', key, default)` → путь: `globalData['form-callback']['error'][lang][key]`.

### 1.7. Отправка формы (строки 544-793) — 250 строк

**Подготовка кнопки:**
1. `disabled = true`, `.loading` класс.
2. Сохранить `originalButtonContent = submitButton.innerHTML`.
3. Заменить innerHTML: `<img spinner> Отправляем заявку`.
4. Добавить `.no-pseudo-icon` (отключает `::before`/`::after`).
5. Инжектировать `<style#spinner-animation>` в `<head>` — **ДУБЛЬ** стилей из CSS.

**Сборка FormData:**
- `current_url` — `window.location.href`
- `name`, `phone` (**в отформатированном виде!** — баг), `square`, `email` (если не пуст), `policy` (`on`/`off`)
- `lang` — `document.documentElement.lang`

**UTM-сбор (3 источника в порядке приоритета):**
1. `sessionStorage.getItem(key)` — если `utm_session === '1'`
2. URL-параметры — `new URLSearchParams(window.location.search)`
3. Cookie — `window.utmHelper.getCookie(key)` → fallback на локальный `getCookie()` (дублирует utm.js)
4. Маркер `utm_session: '1'` в FormData
5. UTM из URL также добавляются в GET-параметры POST-запроса (last-touch)

**Отправка (XHR):**
- `POST` на `window.url('api/send')` + UTM в query string
- Заголовок `X-Requested-With: XMLHttpRequest`
- **Обработка ответа:**
  - `processing: true` → `checkSubmissionStatus()` (по факту считает успехом, код опроса за `return` — unreachable)
  - `success === undefined` → считать успехом (backward compat)
  - **Успех**: `CustomEvent('formSubmissionSuccess')`, кнопка → иконка ✓ + «Успешно отправлена», `form.reset()`, `clearErrors()`. **БАГ**: кнопка навсегда остаётся «Успешно отправлена» — нет таймера возврата.
  - **Ошибка**: показать `errors[field]` из ответа, или `message`, или дефолтный текст. Восстановить кнопку.
  - **Сетевая ошибка**: восстановить кнопку, показать «Ошибка соединения».

### 1.8. Мёртвый код

- `showSuccessMessage()` (строки 795-809) — дублирует `reset()` + `clearErrors()`, вызывается перед тем же кодом в sendForm.
- `checkSubmissionStatus()` (строки 812-998) — имеет `return` на строке 842, весь код опроса `api/status` недостижим.

### 1.9. Внешние зависимости

| Зависимость | Источник | Используется |
|------------|---------|-------------|
| `window.url(path)` | `main.js` строка 17 | Везде для URL |
| `window.globalData` | Устанавливается после загрузки `global.json` | i18n текстов |
| `window.utmHelper.getCookie()` | `assets/js/utils/utm.js` | UTM из cookie |
| `window.Inputmask` | `vendor.js` + `expose-vendors.js` | **НЕ используется** (пылится) |
| `country-codes.json` | `assets/js/data/` | **Файл не существует** |

### 1.10. Twig-шаблон (form-callback.twig)

Уже обновлён ранее — содержит: `novalidate`, уникальные `id` через `form_uid`, `<label class="sr-only">`, `autocomplete`, `inputmode`, `role="alert"`, `aria-live`, скрытое поле `csrf_token`.

### 1.11. CSS (form-callback.css)

Уже обновлён ранее — содержит: `.sr-only`, `:focus-visible`, `prefers-reduced-motion`, единицы в rem.

### 1.12. Бэкенд (ApiSendAction.php)

Уже реализован — содержит: CSRF-проверка, идемпотентность, валидация, JSON-ответы с `code`/`message`/`errors`/`request_id`.

---

## 2. Список всех багов и проблем оригинала

| # | Проблема | Критичность | Решение |
|---|---------|-------------|---------|
| 1 | Submit по `click` — не работает Enter | Высокая | `form.addEventListener('submit', ...)` |
| 2 | Нет защиты от двойной отправки | Высокая | Флаг `isSubmitting` + `disabled` |
| 3 | Телефон отправляется отформатированным | Средняя | Нормализация: `value.replace(/\D/g, '')` |
| 4 | Курсор прыгает в маске телефона | Средняя | Заменить на `Inputmask` |
| 5 | Нет CSRF-токена в отправке | Высокая | Читать `input[name="csrf_token"]` → FormData |
| 6 | Нет идемпотентности | Средняя | UUID в FormData |
| 7 | XHR вместо fetch | Низкая | `fetch` + `AbortController` |
| 8 | innerHTML в кнопке (XSS) | Средняя | `textContent` + `createElement` |
| 9 | JS-инжекция `<style>` для спиннера | Низкая | Удалить, стили в CSS |
| 10 | Кнопка навсегда «Успешно» | Средняя | Таймер возврата (4 сек) |
| 11 | `form.reset()` не чистит маску | Низкая | Inputmask сам обрабатывает reset |
| 12 | Мёртвый код (showSuccessMessage, checkSubmissionStatus) | Низкая | Удалить |
| 13 | Дубль `getCookie` | Низкая | Использовать `window.utmHelper` |
| 14 | Нет fallback при ошибке global.json | Высокая | Инициализировать с дефолтами |
| 15 | Нет `aria-invalid` на полях | Средняя | Добавить при валидации |
| 16 | `country-codes.json` не существует | Средняя | Инлайн словарь для всех языков |
| 17 | Один файл 1000 строк | Средняя | Разбить на модули |

---

## 3. Целевая архитектура

```
assets/js/components/form-callback/
├── index.js        — Точка входа, класс CallbackForm, auto-init, экспорт
├── api.js          — FormApi: fetch, CSRF, idempotency, UTM, таймаут
├── validation.js   — Чистые валидаторы + FormValidator (DOM)
├── mask.js         — PhoneMask: обёртка Inputmask с настройками по языку
├── ui.js           — FormUI: ошибки, кнопка, скролл, безопасный DOM
├── i18n.js         — I18n: полная поддержка globalData['form-callback'] с fallback
└── constants.js    — Коды стран, дефолтные тексты, конфигурация
```

**Принципы:**
- Каждый модуль — один файл, одна ответственность.
- Чистые функции для валидации (тестируемы без DOM).
- Никакого `innerHTML` — только `textContent` + DOM API.
- `fetch` + `AbortController` вместо XHR.
- `Inputmask` (уже в проекте) вместо 220 строк кастомного кода.
- Полная поддержка i18n через `globalData` с fallback на дефолты.
- Экспорт `window.initCallbackForm(root)` для динамических форм.

---

## 4. Детальный план по шагам

### Шаг 1. `constants.js` — Конфигурация и словари

**Что содержит:**
- `COUNTRY_CODES` — полный инлайн-словарь (16 стран из оригинала). Формат: `{ '7': { code: '+7', country: 'ru', format: 'russia', name: 'Россия' }, ... }`.
- `DEFAULT_TEXTS` — дефолтные тексты ошибок и UI для RU и EN. Структура: `{ ru: { phone_required: '...', ... }, en: { ... } }`.
- `PHONE_MASKS` — маски Inputmask для каждого формата: `{ russia: '+7 (999) 999-99-99', 'north-america': '+9 (999) 999-9999', standard: '+9{1,4} 99-999-99-99' }`.
- `UTM_KEYS` — `['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']`.
- `API_TIMEOUT_MS` — `15000`.
- `SUCCESS_RESTORE_MS` — `4000`.

**Зависимости:** Нет.

### Шаг 2. `i18n.js` — Локализация

**Что содержит:**
- Класс `I18n` с конструктором `(formCallbackData, lang)`.
- `formCallbackData` — объект `window.globalData['form-callback']` (или `null`).
- `lang` — строка (`ru`, `en`, ...), определяется из `document.documentElement.lang`.
- Метод `get(category, key, defaultValue)`:
  - Путь: `formCallbackData[category][lang][key]` (точно как в оригинале).
  - Если не найдено — `DEFAULT_TEXTS[lang][key]`.
  - Если и там нет — `defaultValue`.

**Зависимости:** `constants.js` (`DEFAULT_TEXTS`).

### Шаг 3. `validation.js` — Валидация

**Чистые функции (без DOM, для тестов):**
- `isValidPhone(digits, countryCodeDigits)` — если есть код страны: `digits.length >= countryCodeDigits.length + 5`. Иначе: `digits.length >= 7`.
- `isValidEmail(value)` — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `isRequired(value)` — `value.trim().length > 0`.
- `isMinLength(value, min)` — `value.trim().length >= min`.
- `normalizePhone(value)` — `value.replace(/\D/g, '')`.

**DOM-функции:**
- `isFieldVisible(field)` — проверяет `.form-callback__item` родителя на `display: none`, `visibility: hidden`, `opacity: 0`. Точная копия логики оригинала.
- Класс `FormValidator(form, i18n)`:
  - Метод `validate()` → `{ isValid: boolean, errors: { fieldName: message }, firstError: string }`.
  - Проверяет: phone (всегда), name (если видимо), square (если видимо), email (если есть значение), policy (если видимо).
  - Для phone: берёт `data-country-code` с input для расчёта минимальной длины (как в оригинале).
  - Все тексты ошибок через `i18n.get('error', key, default)`.

**Зависимости:** `i18n.js`.

### Шаг 4. `mask.js` — Маска телефона

**Подход:** Использовать `window.Inputmask` (уже глобально доступен через `vendor.js`).

**Класс `PhoneMask(input, countryCodes)`:**
- Конструктор принимает `<input>` элемент и словарь `COUNTRY_CODES`.
- Метод `init()`:
  - Определить дефолтную маску по языку (`ru`→russia, `en`→north-america, `de`→standard).
  - Создать экземпляр `Inputmask` с динамической маской.
  - Сохранять `data-country-code` и `data-detected-format` на input (для совместимости с валидацией).
- Метод `destroy()`:
  - Снять маску через Inputmask API.
  - Удалить data-атрибуты.
- Обработка автозаполнения:
  - Событие `animationstart` для Chrome autofill.
  - `setTimeout` для предзаполненных значений.
- Конвертация российских номеров: 8XXXXXXXXXX → 7XXXXXXXXXX, 9XXXXXXXXXX → 7XXXXXXXXXX (как в оригинале, строки 358-364).

**Зависимости:** `constants.js` (`COUNTRY_CODES`, `PHONE_MASKS`).

### Шаг 5. `ui.js` — Управление DOM

**Класс `FormUI(form, i18n)`:**
- Конструктор:
  - Найти `button[type="submit"]`, `.form-callback__error` контейнер.
  - Сохранить `originalButtonContent` (клонировать `childNodes`, **не** innerHTML).
  - Если нет контейнера ошибок — создать (как в оригинале, строки 126-138).

- **`showFieldError(fieldName)`**:
  - Найти `[name="${fieldName}"]` → ближайший `.form-callback__item` → `.error` класс.
  - Установить `aria-invalid="true"` на input.
  
- **`showFormError(message)`**:
  - Найти `<span>` в контейнере ошибок → `textContent = message` (без innerHTML!).
  - Убрать `.hidden`.
  - `scrollIntoView({ behavior: 'smooth', block: 'center' })` (как в оригинале).

- **`clearErrors()`**:
  - Убрать `.error` со всех `.form-callback__item`, `input`, `textarea`, `select`.
  - Убрать `aria-invalid` со всех input.
  - Скрыть контейнер ошибок, очистить `<span>`.

- **`clearFieldError(field)`**:
  - Убрать `.error` с `.form-callback__item`.
  - Убрать `aria-invalid`.
  - Если ошибок больше нет — скрыть контейнер (как в оригинале, строки 153-161).

- **`setLoading()`**:
  - `disabled = true`, `.loading` класс, `.no-pseudo-icon`.
  - Заменить содержимое кнопки на: `<img>` спиннер (через `createElement`) + текстовый узел «Отправляем заявку» (через `i18n`).

- **`setSuccess()`**:
  - Заменить содержимое кнопки на: `<img>` галочка + «Успешно отправлена».
  - `disabled = false`.
  - Через `SUCCESS_RESTORE_MS` (4 сек) → `restoreButton()`.

- **`setError()`**:
  - Восстановить кнопку → `restoreButton()`.

- **`restoreButton()`**:
  - Очистить содержимое кнопки.
  - Восстановить из сохранённых `childNodes` (клоны).
  - Убрать `.loading`, `.no-pseudo-icon`, `disabled = false`.

**Зависимости:** `i18n.js`, `constants.js` (`SUCCESS_RESTORE_MS`).

### Шаг 6. `api.js` — Сетевой слой

**Класс `FormApi(baseUrl)`:**
- `baseUrl` — значение из `window.url('api/send')`.
- Статический метод `generateIdempotencyKey()` — `crypto.randomUUID()` с fallback.

- **`send(formData, signal)`** → `Promise<Object>`:
  - Добавить `idempotency_key` если нет.
  - Дополнить `formData` UTM-параметрами через `_collectUtm(formData)`.
  - Собрать URL с UTM в query string (last-touch из URL, как в оригинале строки 660-669).
  - `fetch(url, { method: 'POST', body: formData, headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }, signal })`.
  - Таймаут через `AbortSignal.timeout(API_TIMEOUT_MS)` комбинированный с переданным `signal`.
  - Парсить JSON.
  - Обработка ответа:
    - `processing: true` → считать успехом (как в оригинале, checkSubmissionStatus по факту сразу показывает успех).
    - `success === undefined` → считать успехом (backward compat).
    - Нормализация ошибок: `{ success, message, errors, code, requestId }`.
  - При ошибке сети → нормализованный объект ошибки с `code: 'NETWORK_ERROR'`.
  - При ошибке JSON-парсинга → `code: 'PARSE_ERROR'`.

- **`_collectUtm(formData)`** (приватный):
  - Проверить `sessionStorage.getItem('utm_session') === '1'` ИЛИ наличие UTM в URL.
  - Приоритет для каждого ключа: `sessionStorage` → URL params → `window.utmHelper.getCookie()`.
  - Добавить `utm_session: '1'`.
  - **Без дублирования `getCookie`** — только `window.utmHelper`.

- **`_buildSendUrl(baseUrl)`** (приватный):
  - Добавить UTM из текущего URL в query string POST-запроса (last-touch).

**Зависимости:** `constants.js` (`UTM_KEYS`, `API_TIMEOUT_MS`).

### Шаг 7. `index.js` — Оркестратор

**Класс `CallbackForm(formElement, config)`:**
- `config` = `{ messages, lang }`.
- Создаёт экземпляры: `I18n`, `FormValidator`, `PhoneMask`, `FormUI`, `FormApi`.
- `isSubmitting = false`.
- `abortController = null`.

- **`init()`**:
  - Заполнить `input[name="current_url"]` → `window.location.href`.
  - `this.mask.init()`.
  - `form.addEventListener('submit', this._handleSubmit.bind(this))`.
  - Обработчики `input` на полях → `ui.clearFieldError(field)` (как в оригинале).
  - Обработчик `change` на policy → `ui.clearFieldError(checkbox)`.

- **`async _handleSubmit(e)`**:
  - `e.preventDefault()`.
  - Проверка `isSubmitting` → return.
  - `ui.clearErrors()`.
  - `validation.validate()` → если невалидно: `ui.showFormError(firstError)`, `ui.showFieldError(fieldName)` для каждого поля → return.
  - `isSubmitting = true`, `ui.setLoading()`.
  - Собрать `FormData`: все поля формы + нормализованный телефон + `csrf_token` + `current_url` + `lang`.
  - `abortController = new AbortController()`.
  - `try`:
    - `response = await api.send(formData, abortController.signal)`.
    - `ui.setSuccess()`, `form.reset()`, `ui.clearErrors()`.
    - Dispatch `CustomEvent('formSubmissionSuccess', { bubbles: true, detail: { form, formData, serverResponse } })`.
  - `catch(error)`:
    - Если `AbortError` → игнорировать.
    - Если `error.errors` (серверная валидация) → показать field errors + form error.
    - Иначе → `ui.showFormError(error.message)`.
    - `ui.setError()`.
  - `finally`:
    - `isSubmitting = false`, `abortController = null`.

- **`destroy()`**:
  - `mask.destroy()`, `abortController?.abort()`.

**Инициализация:**
```js
function initCallbackForms(root = document) {
  const forms = root.querySelectorAll('.form-callback');
  if (!forms.length) return [];
  return Array.from(forms).map(form => new CallbackForm(form, config));
}
```

- `DOMContentLoaded`:
  - Проверить `window.url`.
  - Загрузить `global.json` через `fetch`.
  - При успехе → `window.globalData = data`, `initCallbackForms()`.
  - При ошибке → `console.warn(...)`, `initCallbackForms()` с пустыми данными (**fallback!**).

- **Экспорт для динамических форм:**
```js
export { CallbackForm, initCallbackForms };
window.initCallbackForms = initCallbackForms;
```

**Зависимости:** Все модули.

### Шаг 8. Обновление `main.js`

Изменить импорт:
```js
// Было:
import './components/form-callback.js';
// Стало:
import './components/form-callback/index.js';
```

### Шаг 9. Удаление старого файла

После проверки работоспособности:
- Удалить `assets/js/components/form-callback.js` (1001 строка).
- Удалить пустые модули из предыдущей попытки (если остались).

### Шаг 10. Проверка

- `npm run lint` — ESLint.
- `npm run lint:css` — Stylelint.
- `npm run build:js` — webpack сборка.
- Ручная проверка: открыть страницу с формой, проверить маску, валидацию, отправку.

---

## 5. Матрица покрытия: оригинал → новый код

| Функциональность оригинала | Модуль | Метод/функция |
|---------------------------|--------|--------------|
| `getLocalizedText()` | `i18n.js` | `I18n.get()` |
| `loadCountryCodes()` | `constants.js` | `COUNTRY_CODES` (инлайн) |
| `initForm()` | `index.js` | `CallbackForm.init()` |
| `initPhoneMask()` + все обработчики (220 строк) | `mask.js` | `PhoneMask.init()` (Inputmask) |
| `formatPhoneNumber()` | `mask.js` | Inputmask шаблоны |
| `detectCountryCode()` | `mask.js` | Inputmask + `PhoneMask._detectCountry()` |
| `isFieldVisible()` | `validation.js` | `isFieldVisible()` |
| `validateForm()` | `validation.js` | `FormValidator.validate()` |
| `markFieldAsError()` | `ui.js` | `FormUI.showFieldError()` |
| `showFormError()` | `ui.js` | `FormUI.showFormError()` |
| `clearErrors()` | `ui.js` | `FormUI.clearErrors()` |
| Снятие ошибок при input | `index.js` + `ui.js` | `CallbackForm.init()` + `FormUI.clearFieldError()` |
| `sendForm()` — сборка FormData | `index.js` + `api.js` | `_handleSubmit()` + `FormApi._collectUtm()` |
| `sendForm()` — XHR | `api.js` | `FormApi.send()` (fetch) |
| `sendForm()` — обработка ответа | `index.js` | `_handleSubmit()` try/catch |
| Кнопка loading/success/error/restore | `ui.js` | `setLoading()`, `setSuccess()`, `setError()`, `restoreButton()` |
| `showSuccessMessage()` (мёртвый код) | — | Удалён |
| `checkSubmissionStatus()` (мёртвый код) | — | Удалён. `processing: true` → успех в `api.js` |
| Дубль `getCookie()` | — | Удалён. Используется `window.utmHelper` |
| JS-инжекция `<style>` спиннера | — | Удалена. Стили в CSS |
| UTM в GET-параметрах POST-запроса | `api.js` | `FormApi._buildSendUrl()` |
| current_url | `index.js` | В `_handleSubmit()` через FormData |
| lang | `index.js` | В `_handleSubmit()` через FormData |
| CSRF-токен | `index.js` | В `_handleSubmit()` из hidden input |
| Idempotency key | `api.js` | `FormApi.generateIdempotencyKey()` |
| Экспорт для динамических форм | `index.js` | `window.initCallbackForms()` |

---

## 6. Порядок написания кода

| # | Файл | Зависит от | Строк (оценка) |
|---|------|-----------|----------------|
| 1 | `constants.js` | — | ~60 |
| 2 | `i18n.js` | constants | ~30 |
| 3 | `validation.js` | i18n | ~90 |
| 4 | `mask.js` | constants | ~80 |
| 5 | `ui.js` | i18n, constants | ~120 |
| 6 | `api.js` | constants | ~110 |
| 7 | `index.js` | все модули | ~120 |
| | **Итого** | | **~610** |

Было: 1 файл, 1001 строка, 0 модулей.
Станет: 7 файлов, ~610 строк, полное покрытие + новые фичи.
