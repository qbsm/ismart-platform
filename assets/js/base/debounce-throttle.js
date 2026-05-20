/**
 * debounce(fn, ms) — вызывает fn не чаще одного раза в ms после последнего вызова.
 * throttle(fn, ms) — вызывает fn не чаще одного раза в ms.
 */

export function debounce(fn, ms) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function throttle(fn, ms) {
  let last = 0;
  let scheduled = null;
  return function (...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (scheduled) {
        clearTimeout(scheduled);
        scheduled = null;
      }
      last = now;
      fn.apply(this, args);
    } else if (!scheduled) {
      scheduled = setTimeout(() => {
        scheduled = null;
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}
