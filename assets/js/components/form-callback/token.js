const ENDPOINT = 'api/form-token';
const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 700;

let pending = null;
let cached = '';

function endpointUrl() {
  const base = (window.appConfig && window.appConfig.baseUrl) || '/';
  return base.endsWith('/') ? base + ENDPOINT : `${base}/${ENDPOINT}`;
}

async function request() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpointUrl(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return typeof payload.token === 'string' ? payload.token : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Токен запрашивается заранее — при первом касании поля, — чтобы к моменту отправки он уже
 * был на руках и его возраст успел набежать. Одна повторная попытка на случай мигнувшей сети.
 */
export function fetchFormToken() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;

  pending = request()
    .then((token) => {
      if (token) return token;
      return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)).then(request);
    })
    .then((token) => {
      cached = token;
      pending = null;
      return token;
    })
    .catch(() => {
      pending = null;
      return '';
    });

  return pending;
}

export function primeFormToken(form) {
  if (!form) return;
  const arm = () => {
    fetchFormToken().then((token) => {
      const field = form.querySelector('input[name="form_token"]');
      if (field && token) field.value = token;
    });
  };
  ['pointerdown', 'focusin', 'keydown'].forEach((event) => {
    form.addEventListener(event, arm, { once: true, passive: true });
  });
}

/**
 * Последний рубеж перед отправкой: если поле пустое (JS не успел, вкладка ожила из кэша),
 * токен добирается здесь. Пустой ответ не блокирует отправку — заявку доедет по сессионному
 * токену из разметки, потерять её из-за нашей же защиты нельзя.
 */
export async function ensureFormToken(formData, form) {
  const current = formData.get('form_token');
  if (typeof current === 'string' && current !== '') return;

  const token = await fetchFormToken();
  if (!token) return;

  formData.set('form_token', token);
  const field = form && form.querySelector('input[name="form_token"]');
  if (field) field.value = token;
}
