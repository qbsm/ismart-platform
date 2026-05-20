/**
 * UTM-метки: сохранение из URL в cookie/sessionStorage и API для чтения.
 * Используется формами (form-callback) и аналитикой.
 */
(function () {
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const COOKIE_DAYS = 30;

  function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
  }

  function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      name + '=' + encodeURIComponent(value) + ';path=/;expires=' + expires.toUTCString() + ';SameSite=Lax';
  }

  const params = new URLSearchParams(window.location.search);
  const hasUtm = UTM_KEYS.some(function (k) {
    return params.get(k);
  });

  if (hasUtm) {
    try {
      sessionStorage.setItem('utm_session', '1');
    } catch {
      /* ignore */
    }
    UTM_KEYS.forEach(function (key) {
      const val = params.get(key);
      if (val) {
        try {
          sessionStorage.setItem(key, val);
        } catch {
          /* ignore */
        }
        setCookie(key, val, COOKIE_DAYS);
      }
    });
  }

  window.utmHelper = {
    getCookie: getCookie,
    getKeys: function () {
      return UTM_KEYS.slice();
    },
  };
})();
