// assets/js/main.js

import { buildUrl } from './base/url.js';

function url(path) {
  const baseUrl = window.appConfig?.baseUrl;
  if (typeof baseUrl === 'undefined' || baseUrl === '') {
    console.error('window.appConfig.baseUrl не определен');
    return buildUrl('/', path);
  }
  return buildUrl(baseUrl, path);
}
window.url = url;

// --- Vendor ---
import './vendor.js';
import './base/expose-vendors.js';
import { onReady } from './base/init.js';

// --- Sections ---
import './sections/logoline.js';
import './sections/hero.js';
import './sections/content.js';
import './sections/intro.js';
import './sections/footer.js';
import './sections/burger-menu.js';
import './sections/header.js';
import './sections/cookie-panel.js';
import './sections/contacts.js';
import './sections/headline.js';
import './sections/us.js';
import './sections/tires.js';
import './sections/dealers.js';

// --- Components ---
import './components/button.js';
import './components/analytics.js';
import './components/form-callback/index.js';
import './components/heading.js';
import './components/accordion.js';
import './components/spoiler.js';
import './components/custom-list.js';
import './components/numbered-list.js';
import './components/mini-table.js';
import './components/blockquote.js';
import './components/cover.js';
import './components/features-list.js';
import './components/card-number.js';
import setupSliders from './components/slider.js';
import './components/burger-icon.js';

// --- Pages ---
import './pages/404.js';
import './pages/contacts.js';
import './pages/index.js';
import './pages/news.js';
import './pages/tire-detail.js';

// --- Init ---
onReady(() => {
  if (typeof setupSliders === 'function') {
    setupSliders();
  }
});
