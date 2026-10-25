/**
 * Единая точка инициализации: регистрация колбэков на DOMContentLoaded.
 * Компоненты вызывают onReady(fn); один раз срабатывает запуск всех.
 */
const callbacks = [];

// Каждый компонент — сам по себе: ошибка одного (слайдер, карта, метод, которого нет в старом
// браузере) не должна отменять запуск остальных. Раньше исключение в разделе дилеров обрывало
// цикл, и форма заявки, подключённая позже, не запускалась вовсе.
function safeCall(fn) {
  try {
    fn();
  } catch (error) {
    console.error('[onReady]', error);
  }
}

function run() {
  callbacks.forEach(safeCall);
  callbacks.length = 0;
}

export function onReady(fn) {
  if (typeof fn !== 'function') return;
  if (document.readyState === 'loading') {
    callbacks.push(fn);
  } else {
    safeCall(fn);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
}
