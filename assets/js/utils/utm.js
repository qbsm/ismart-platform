/**
 * UTM-метки: сохранение из URL в cookie/sessionStorage и API для чтения.
 * Используется формами (form-callback) и аналитикой.
 */
(function () {
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const AD_KEYS = ['yclid', 'gclid', 'ysclid'];
  const FIRST_TOUCH = 'first_touch';
  const COOKIE_DAYS = 30;
  const VALUE_LIMIT = 500;

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

  AD_KEYS.forEach(function (key) {
    const val = params.get(key);
    if (val) setCookie(key, val, COOKIE_DAYS);
  });

  // Первое касание пишется один раз и живёт 30 дней: метки выше перебиваются каждым визитом,
  // и заявка человека, пришедшего по рекламе неделю назад, выглядела бы прямым заходом.
  if (!getCookie(FIRST_TOUCH)) {
    setCookie(
      FIRST_TOUCH,
      JSON.stringify({
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        landing: window.location.href.split('#')[0].slice(0, VALUE_LIMIT),
        referrer: (document.referrer || '').slice(0, VALUE_LIMIT),
      }),
      COOKIE_DAYS
    );
  }

  window.utmHelper = {
    getCookie: getCookie,
    getKeys: function () {
      return UTM_KEYS.slice();
    },
    getAdKeys: function () {
      return AD_KEYS.slice();
    },
    getFirstTouch: function () {
      try {
        return JSON.parse(getCookie(FIRST_TOUCH) || '{}');
      } catch {
        return {};
      }
    },
  };
})();
