import { onReady } from '../base/init.js';
import { cityToSlug, slugToCity } from '../utils/translit.js';

const YANDEX_MAPS_API = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU';

function parseCoords(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return parts;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to)) {
    return Number.POSITIVE_INFINITY;
  }
  const earthRadiusKm = 6371;
  const dLat = toRadians(to[0] - from[0]);
  const dLon = toRadians(to[1] - from[1]);
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function findNearestPoint(points, coords) {
  if (!Array.isArray(points) || points.length === 0 || !Array.isArray(coords)) {
    return null;
  }
  let nearest = null;
  let minDistance = Number.POSITIVE_INFINITY;
  points.forEach((point) => {
    const distance = getDistanceKm(coords, point.coords);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = point;
    }
  });
  return nearest;
}

function isGeolocationEnabled(mapEl) {
  const value = (mapEl?.dataset?.geolocation || '').toString().trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function applyDetectedCoords(mapState, citySelect, applyFilters, coords) {
  if (!mapState || !Array.isArray(coords)) {
    return;
  }
  const nearestPoint = findNearestPoint(mapState.points, coords);
  let cityWasApplied = false;

  // Если город уже выбран (например, из URL) — не перетираем геолокацией.
  if (citySelect && !citySelect.value && nearestPoint?.city) {
    const cityValue = nearestPoint.city.toString().trim();
    if (cityValue) {
      const hasOption = Array.from(citySelect.options || []).some((option) => option.value === cityValue);
      if (hasOption) {
        citySelect.value = cityValue;
        applyFilters();
        cityWasApplied = true;
      }
    }
  }

  if (!cityWasApplied && mapState.map) {
    mapState.map.setCenter(coords, Math.max(mapState.baseZoom, 10), { duration: 250 });
  }
}

function applyIpGeolocation(mapState, citySelect, applyFilters) {
  if (!window.ymaps?.geolocation?.get) {
    return;
  }
  window.ymaps.geolocation
    .get({ provider: 'yandex' })
    .then((result) => {
      const firstGeoObject = result?.geoObjects?.get?.(0);
      const coords = firstGeoObject?.geometry?.getCoordinates?.();
      if (Array.isArray(coords)) {
        applyDetectedCoords(mapState, citySelect, applyFilters, coords);
      }
    })
    .catch(() => {
      // Не удалось получить IP-геолокацию.
    });
}

function applyUserGeolocation(mapEl, mapState, citySelect, applyFilters) {
  if (!isGeolocationEnabled(mapEl) || !mapState) {
    return;
  }

  const canAskBrowserGeolocation = window.isSecureContext && !!navigator.geolocation;
  if (!canAskBrowserGeolocation) {
    applyIpGeolocation(mapState, citySelect, applyFilters);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userCoords = [position.coords.latitude, position.coords.longitude];
      applyDetectedCoords(mapState, citySelect, applyFilters, userCoords);
    },
    () => {
      // Пользователь запретил геолокацию или браузер не смог её определить.
      // Пробуем менее точный fallback по IP через Yandex.
      applyIpGeolocation(mapState, citySelect, applyFilters);
    },
    {
      enableHighAccuracy: false,
      timeout: 7000,
      maximumAge: 300000,
    }
  );
}

function createFallbackIframe(container, src) {
  if (!src) {
    return;
  }
  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.className = 'map';
  iframe.src = src;
  iframe.loading = 'lazy';
  iframe.title = 'Карта точек продаж';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.style.border = '0';
  container.appendChild(iframe);
}

function normalize(value) {
  return (value || '').toString().trim().toLowerCase();
}

function escapeHtml(value) {
  return (value || '')
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizePhoneHref(value) {
  const raw = (value || '').toString().trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('tel:') ? raw : `tel:${raw}`;
}

function parsePhones(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        title: (item?.title || '').toString().trim(),
        href: (item?.href || '').toString().trim().replace('tel:', ''),
      }))
      .filter((item) => item.title && item.href);
  } catch {
    return [];
  }
}

function buildDealerBalloon(point) {
  const badges = [];
  if (point.bshm) {
    badges.push('<span class="card-dealer__badge" data-filter="bshm">Шиномонтаж</span>');
  }
  if (point.guarantee) {
    const guaranteeTitle = point.guaranteeTitle || 'Расширенная гарантия';
    badges.push(`<span class="card-dealer__badge" data-filter="guarantee">${escapeHtml(guaranteeTitle)}</span>`);
  }

  const phoneBlock = point.phones
    .map(
      (phone) =>
        `<div class="card-dealer__item opacity-80"><div class="link-wrap"><a href="${escapeHtml(normalizePhoneHref(phone.href))}" class="link link-a font-1-demi nowrap">${escapeHtml(phone.title)}</a></div></div>`
    )
    .join('');
  const siteBlock =
    point.site && point.siteHref
      ? `<div class="card-dealer__item opacity-80"><div class="link-wrap"><a href="${escapeHtml(point.siteHref)}" target="_blank" rel="noopener noreferrer" class="link link-a nowrap">${escapeHtml(point.site)}</a></div></div>`
      : '';

  return `<article class="card-dealer card-dealer-balloon"><div class="card-dealer__item title-wrap"><h3 class="card__title font-2 weight-600">${escapeHtml(point.name)}</h3><div class="card-dealer__subitem badges-wrap">${badges.join('')}</div><div class="card-dealer__subitem address-wrap opacity-80">${escapeHtml(point.address)}</div></div>${phoneBlock}${siteBlock}</article>`;
}

function loadYandexMaps() {
  return new Promise((resolve, reject) => {
    if (window.ymaps && typeof window.ymaps.ready === 'function') {
      resolve(window.ymaps);
      return;
    }

    const existingScript = document.querySelector('script[data-yandex-maps-api="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.ymaps), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = YANDEX_MAPS_API;
    script.async = true;
    script.dataset.yandexMapsApi = 'true';
    script.onload = () => resolve(window.ymaps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function setMapVisibility(mapState, visibleIds) {
  if (!mapState || !mapState.map) {
    return;
  }
  const visibleCoords = [];
  mapState.points.forEach((point) => {
    const shouldShow = visibleIds.has(point.id);
    if (shouldShow && !point.added) {
      mapState.map.geoObjects.add(point.placemark);
      point.added = true;
    } else if (!shouldShow && point.added) {
      mapState.map.geoObjects.remove(point.placemark);
      point.added = false;
    }
    if (shouldShow) {
      visibleCoords.push(point.coords);
    }
  });

  if (visibleCoords.length > 1) {
    const bounds = mapState.map.geoObjects.getBounds();
    if (bounds) {
      mapState.map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
    }
  } else if (visibleCoords.length === 1) {
    mapState.map.setCenter(visibleCoords[0], Math.max(mapState.baseZoom, 10), { duration: 250 });
  } else {
    mapState.map.setCenter(mapState.baseCenter, mapState.baseZoom, { duration: 250 });
  }
}

function isPointInBounds(coords, bounds) {
  if (!Array.isArray(coords) || !Array.isArray(bounds) || bounds.length !== 2) {
    return false;
  }
  const [southWest, northEast] = bounds;
  if (!Array.isArray(southWest) || !Array.isArray(northEast)) {
    return false;
  }
  const [lat, lon] = coords;
  const [south, west] = southWest;
  const [north, east] = northEast;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

function getVisibleIdsInMapBounds(mapState, allowedIds) {
  if (!mapState?.map || !Array.isArray(mapState.points)) {
    return new Set(allowedIds || []);
  }
  const bounds = mapState.map.getBounds();
  if (!bounds) {
    return new Set(allowedIds || []);
  }
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  const visible = new Set();
  mapState.points.forEach((point) => {
    if (!allowed.has(point.id)) {
      return;
    }
    if (isPointInBounds(point.coords, bounds)) {
      visible.add(point.id);
    }
  });
  return visible;
}

function createDealerMap(mapEl, onReadyMap) {
  const placemarkEls = Array.from(mapEl.querySelectorAll('.map__placemark'));
  const points = placemarkEls
    .map((el) => ({
      id: String(el.dataset.id || ''),
      coords: parseCoords(el.dataset.location),
      city: (el.dataset.city || '').toString().trim(),
      guarantee: el.dataset.guarantee === '1',
      guaranteeTitle: (el.dataset.guaranteeTitle || '').toString().trim(),
      bshm: el.dataset.bshm === '1',
      name: el.dataset.name || '',
      address: el.dataset.address || '',
      phones: parsePhones(el.dataset.phones),
      site: el.dataset.site || '',
      siteHref: el.dataset.siteHref || '',
    }))
    .filter((item) => item.id && Array.isArray(item.coords));
  if (points.length === 0) {
    onReadyMap(null);
    return;
  }
  const center = parseCoords(mapEl.dataset.center) || points[0].coords;
  const zoom = Number(mapEl.dataset.zoom) || 5;
  const fallbackSrc = mapEl.dataset.fallbackSrc || '';

  loadYandexMaps()
    .then((ymaps) => {
      ymaps.ready(() => {
        const map = new ymaps.Map(mapEl, {
          center,
          zoom,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        map.behaviors.disable('scrollZoom');

        const mapPoints = points.map((point) => {
          const balloonContent = buildDealerBalloon(point);
          const placemark = new ymaps.Placemark(
            point.coords,
            {
              balloonContent,
              hintContent: point.name,
            },
            {
              preset: 'islands#redIcon',
              openBalloonOnClick: true,
              hideIconOnBalloonOpen: false,
            }
          );
          placemark.events.add('click', () => {
            placemark.balloon.open();
          });
          map.geoObjects.add(placemark);
          return {
            ...point,
            placemark,
            added: true,
          };
        });

        if (mapPoints.length > 1) {
          const bounds = map.geoObjects.getBounds();
          if (bounds) {
            map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
          }
        }

        onReadyMap({
          map,
          points: mapPoints,
          baseCenter: center,
          baseZoom: zoom,
        });
      });
    })
    .catch(() => {
      createFallbackIframe(mapEl, fallbackSrc);
      onReadyMap(null);
    });
}

function getCityOptions(citySelect) {
  if (!citySelect) {
    return [];
  }
  return Array.from(citySelect.options || [])
    .map((option) => option.value)
    .filter((value) => value !== '');
}

function getBasePathSegment() {
  const path = window.location.pathname || '/';
  const segments = path.split('/').filter(Boolean);
  return segments[0] || '';
}

function getCitySlugFromUrl() {
  const path = window.location.pathname || '/';
  const segments = path.split('/').filter(Boolean);
  return segments[1] || '';
}

function buildBuyUrl(basePath, citySlug) {
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const cleanBase = basePath ? `/${basePath}` : '';
  const path = citySlug ? `${cleanBase}/${citySlug}` : cleanBase || '/';
  return `${path}${search}${hash}`;
}

function parseCityCases(headingEl) {
  if (!headingEl?.dataset?.cityCases) {
    return {};
  }
  try {
    const parsed = JSON.parse(headingEl.dataset.cityCases);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setupCityCopySync(sectionEl, citySelect) {
  const headingEl = sectionEl?.querySelector('.js-dealers-heading');
  const titleEl = headingEl?.querySelector('.heading');
  const cases = parseCityCases(headingEl);

  const headingBase = headingEl?.dataset?.headingBase || titleEl?.textContent || '';
  const headingTemplate = headingEl?.dataset?.headingCityTemplate || `${headingBase} в {city}`;

  const metaTitleBase = sectionEl?.dataset?.metaTitleBase || '';
  const metaTitleTemplate = sectionEl?.dataset?.metaTitleCityTemplate || '';
  const metaDescBase = sectionEl?.dataset?.metaDescriptionBase || '';
  const metaDescTemplate = sectionEl?.dataset?.metaDescriptionCityTemplate || '';

  const descEl = document.querySelector('meta[name="description"]');
  const ogTitleEl = document.querySelector('meta[property="og:title"]');
  const ogDescEl = document.querySelector('meta[property="og:description"]');
  const twitterDescEl = document.querySelector('meta[name="twitter:description"]');
  const twitterTitleEl = document.querySelector('meta[name="twitter:title"]');

  return () => {
    const city = citySelect?.value || '';
    const cityCase = city ? cases[city] || city : '';

    if (titleEl) {
      titleEl.textContent = cityCase ? headingTemplate.replace('{city}', cityCase) : headingBase;
    }

    if (metaTitleBase) {
      const value = cityCase && metaTitleTemplate ? metaTitleTemplate.replace('{city}', cityCase) : metaTitleBase;
      document.title = value;
      ogTitleEl?.setAttribute('content', value);
      twitterTitleEl?.setAttribute('content', value);
    }

    if (metaDescBase) {
      const value = cityCase && metaDescTemplate ? metaDescTemplate.replace('{city}', cityCase) : metaDescBase;
      descEl?.setAttribute('content', value);
      ogDescEl?.setAttribute('content', value);
      twitterDescEl?.setAttribute('content', value);
    }
  };
}

function setupUrlCitySync(sectionEl, citySelect, applyFilters) {
  if (!sectionEl || !citySelect || sectionEl.dataset.urlSyncCity !== '1') {
    return;
  }

  const basePath = getBasePathSegment();
  const cities = getCityOptions(citySelect);
  const updateCopy = setupCityCopySync(sectionEl, citySelect);

  const initialSlug = getCitySlugFromUrl();
  if (initialSlug) {
    const matchedCity = slugToCity(initialSlug, cities);
    if (matchedCity && citySelect.value !== matchedCity) {
      citySelect.value = matchedCity;
      updateCopy();
    }
  }

  const pushUrl = () => {
    const slug = cityToSlug(citySelect.value || '');
    const target = buildBuyUrl(basePath, slug);
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState({ city: citySelect.value || '' }, '', target);
    }
  };

  citySelect.addEventListener('change', () => {
    pushUrl();
    updateCopy();
  });

  window.addEventListener('popstate', () => {
    const slug = getCitySlugFromUrl();
    const matchedCity = slug ? slugToCity(slug, cities) : '';
    if (citySelect.value !== matchedCity) {
      citySelect.value = matchedCity;
      applyFilters();
      updateCopy();
    }
  });
}

onReady(() => {
  const sections = document.querySelectorAll('.dealers.section');
  sections.forEach((sectionEl) => {
    const mapEl = sectionEl.querySelector('.js-dealers-map');
    const citySelect = sectionEl.querySelector('.js-dealers-city');
    const guaranteeCheckbox = sectionEl.querySelector('.js-dealers-guarantee');
    const bshmCheckbox = sectionEl.querySelector('.js-dealers-bshm');
    const cards = Array.from(sectionEl.querySelectorAll('.js-dealer-card'));
    let mapState = null;

    const applyFilters = ({ syncMap = true } = {}) => {
      const selectedCity = normalize(citySelect?.value || '');
      const requireGuarantee = Boolean(guaranteeCheckbox?.checked);
      const requireBshm = Boolean(bshmCheckbox?.checked);
      const matchedIds = new Set();
      const guaranteeLabel = guaranteeCheckbox?.closest('.filter__selector');
      const bshmLabel = bshmCheckbox?.closest('.filter__selector');

      guaranteeLabel?.classList.toggle('active', requireGuarantee);
      bshmLabel?.classList.toggle('active', requireBshm);

      cards.forEach((cardEl) => {
        const city = normalize(cardEl.dataset.city);
        const hasGuarantee = cardEl.dataset.guarantee === '1';
        const hasBshm = cardEl.dataset.bshm === '1';
        const cityMatch = !selectedCity || city === selectedCity;
        const guaranteeMatch = !requireGuarantee || hasGuarantee;
        const bshmMatch = !requireBshm || hasBshm;
        const matchesFilters = cityMatch && guaranteeMatch && bshmMatch;
        if (matchesFilters && cardEl.dataset.id) {
          matchedIds.add(String(cardEl.dataset.id));
        }
      });

      if (syncMap) {
        setMapVisibility(mapState, matchedIds);
      }

      const visibleIds = getVisibleIdsInMapBounds(mapState, matchedIds);
      cards.forEach((cardEl) => {
        const id = String(cardEl.dataset.id || '');
        cardEl.classList.toggle('hidden', !visibleIds.has(id));
      });
    };

    if (mapEl) {
      createDealerMap(mapEl, (state) => {
        mapState = state;
        applyFilters();
        mapState?.map?.events?.add('boundschange', () => applyFilters({ syncMap: false }));
        applyUserGeolocation(mapEl, mapState, citySelect, applyFilters);
      });
    }

    setupUrlCitySync(sectionEl, citySelect, applyFilters);

    citySelect?.addEventListener('change', applyFilters);
    guaranteeCheckbox?.addEventListener('change', applyFilters);
    bshmCheckbox?.addEventListener('change', applyFilters);
    applyFilters();
  });
});
