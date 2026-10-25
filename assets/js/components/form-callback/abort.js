/**
 * AbortController есть с Chrome 66 и Safari 12.1. В более старых браузерах (встроенные браузеры
 * приложений на Android 8, iOS 12.0) `new AbortController()` бросает ReferenceError, и форма
 * падала на нажатии «Отправить» — так avtofin.org потерял заявку 19.10.2026 (Chrome 64).
 * Без него запрос уходит без отмены, а тайм-аут считает таймер: поздний ответ просто не ждём.
 * Повтор после этого безопасен — ключ идемпотентности тот же, вторую заявку сервер не создаст.
 */
export function createAbortController() {
  if (typeof AbortController === 'function') {
    return new AbortController();
  }
  return { signal: undefined, abort() {} };
}

export function abortError() {
  const error = new Error('Превышено время ожидания');
  error.name = 'AbortError';
  return error;
}

/**
 * Ждём промис не дольше timeoutMs: по истечении — AbortError, как у отменённого fetch, и onTimeout
 * (там настоящая отмена, если она есть).
 */
export function withTimeout(promise, timeoutMs, onTimeout) {
  let timerId;
  const expired = new Promise((resolve, reject) => {
    timerId = setTimeout(() => {
      if (onTimeout) onTimeout();
      reject(abortError());
    }, timeoutMs);
  });
  return Promise.race([promise, expired]).then(
    (value) => {
      clearTimeout(timerId);
      return value;
    },
    (error) => {
      clearTimeout(timerId);
      throw error;
    }
  );
}
