// Web Vitals monitoring — lightweight (~1 KB).
// Reports CWV to console (dev) and Yandex.Metrika params (prod).
// Metrics: LCP, FID/INP, CLS, FCP, TTFB.

(function () {
  'use strict';

  if (typeof PerformanceObserver === 'undefined') return;

  var ymId = window.appConfig && window.appConfig.YANDEX_METRIC_ID;

  function send(name, value) {
    var rounded = Math.round(name === 'CLS' ? value * 1000 : value);

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('[WebVitals] ' + name + ': ' + rounded);
    }

    if (ymId && typeof ym === 'function') {
      var params = {};
      params['web_vitals_' + name] = rounded;
      ym(ymId, 'params', params);
    }
  }

  // LCP
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      var last = entries[entries.length - 1];
      if (last) send('LCP', last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* browser does not support this observer */
  }

  // FID
  try {
    new PerformanceObserver(function (list) {
      var entry = list.getEntries()[0];
      if (entry) send('FID', entry.processingStart - entry.startTime);
    }).observe({ type: 'first-input', buffered: true });
  } catch {
    /* browser does not support this observer */
  }

  // CLS
  try {
    var clsValue = 0;
    new PerformanceObserver(function (list) {
      for (var i = 0; i < list.getEntries().length; i++) {
        var entry = list.getEntries()[i];
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        send('CLS', clsValue);
      }
    });
  } catch {
    /* browser does not support this observer */
  }

  // FCP
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === 'first-contentful-paint') {
          send('FCP', entries[i].startTime);
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {
    /* browser does not support this observer */
  }

  // TTFB
  try {
    new PerformanceObserver(function (list) {
      var nav = list.getEntries()[0];
      if (nav) send('TTFB', nav.responseStart);
    }).observe({ type: 'navigation', buffered: true });
  } catch {
    /* browser does not support this observer */
  }

  // INP (Interaction to Next Paint)
  try {
    var maxINP = 0;
    new PerformanceObserver(function (list) {
      for (var i = 0; i < list.getEntries().length; i++) {
        var dur = list.getEntries()[i].duration;
        if (dur > maxINP) maxINP = dur;
      }
    }).observe({ type: 'event', buffered: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && maxINP > 0) {
        send('INP', maxINP);
      }
    });
  } catch {
    /* browser does not support this observer */
  }
})();
