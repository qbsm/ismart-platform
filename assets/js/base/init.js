/**
 * Единая точка инициализации: регистрация колбэков на DOMContentLoaded.
 * Компоненты вызывают onReady(fn); один раз срабатывает запуск всех.
 */
const callbacks = [];

function run() {
  callbacks.forEach((fn) => {
    fn();
  });
  callbacks.length = 0;
}

export function onReady(fn) {
  if (typeof fn !== 'function') return;
  if (document.readyState === 'loading') {
    callbacks.push(fn);
  } else {
    fn();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
}
