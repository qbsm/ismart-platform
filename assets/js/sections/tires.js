import { onReady } from '../base/init.js';

onReady(() => {
  const root = document.querySelector('.tires');
  if (!root) return;

  const cards = Array.from(root.querySelectorAll('.js-filter-card'));
  const seasonButtons = Array.from(root.querySelectorAll('.js-select-season'));
  const diameterSelect = root.querySelector('.js-select-diameter');
  const profileSelect = root.querySelector('.js-select-profile');
  const widthSelect = root.querySelector('.js-select-width');
  const emptyState = root.querySelector('.js-filter-empty');

  const includesToken = (source, token) => {
    if (!token) return true;
    return (source || '').includes(`|${token}|`);
  };

  const parseSizes = (sizesStr) => {
    return (sizesStr || '')
      .split('|')
      .filter(Boolean)
      .map((label) => {
        const m = label.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)R(\d+)/);
        if (!m) return null;
        return { width: m[1], profile: m[2], diameter: m[3] };
      })
      .filter(Boolean);
  };

  const matchesSizes = (sizes, width, profile, diameter) => {
    if (!width && !profile && !diameter) return true;
    return sizes.some((s) => {
      if (width && s.width !== width) return false;
      if (profile && s.profile !== profile) return false;
      if (diameter && s.diameter !== diameter) return false;
      return true;
    });
  };

  // Pre-parse sizes for each card
  const cardData = cards.map((card) => ({
    el: card,
    season: card.dataset.season || '|',
    sizes: parseSizes(card.dataset.sizes),
  }));

  const updateSelectOptions = (select, availableValues, currentValue) => {
    if (!select) return;
    const options = Array.from(select.options);
    options.forEach((opt) => {
      if (!opt.value) return; // skip "Все"
      const available = availableValues.has(opt.value);
      opt.disabled = !available;
      opt.style.display = available ? '' : 'none';
    });
    // If current value is no longer available, reset
    if (currentValue && !availableValues.has(currentValue)) {
      select.value = '';
    }
  };

  const applyFilter = () => {
    const activeSeasonBtn = seasonButtons.find((btn) => btn.classList.contains('active'));
    const season = activeSeasonBtn ? activeSeasonBtn.dataset.season : '';
    const diameter = diameterSelect ? diameterSelect.value : '';
    const profile = profileSelect ? profileSelect.value : '';
    const width = widthSelect ? widthSelect.value : '';

    let visibleCount = 0;

    // Determine visible cards
    cardData.forEach((cd) => {
      let visible = true;
      if (season && !includesToken(cd.season, season)) visible = false;
      if (visible && (width || profile || diameter)) {
        visible = matchesSizes(cd.sizes, width, profile, diameter);
      }
      cd.el.classList.toggle('hidden', !visible);
      cd.visible = visible;
      if (visible) visibleCount += 1;
    });

    if (emptyState) {
      emptyState.classList.toggle('hidden', visibleCount > 0);
    }

    // Collect available values from cards matching season only (for selects)
    const seasonMatchCards = cardData.filter((cd) => !season || includesToken(cd.season, season));

    const availDiameters = new Set();
    const availProfiles = new Set();
    const availWidths = new Set();

    seasonMatchCards.forEach((cd) => {
      cd.sizes.forEach((s) => {
        const matchW = !width || s.width === width;
        const matchP = !profile || s.profile === profile;
        const matchD = !diameter || s.diameter === diameter;

        // Diameter available if width and profile match
        if (matchW && matchP) availDiameters.add(s.diameter);
        // Profile available if width and diameter match
        if (matchW && matchD) availProfiles.add(s.profile);
        // Width available if profile and diameter match
        if (matchP && matchD) availWidths.add(s.width);
      });
    });

    updateSelectOptions(diameterSelect, availDiameters, diameter);
    updateSelectOptions(profileSelect, availProfiles, profile);
    updateSelectOptions(widthSelect, availWidths, width);
  };

  seasonButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.classList.contains('disabled')) return;
      const wasActive = btn.classList.contains('active');
      seasonButtons.forEach((item) => item.classList.remove('active'));
      if (!wasActive) btn.classList.add('active');
      // Reset selects when changing season
      if (diameterSelect) diameterSelect.value = '';
      if (profileSelect) profileSelect.value = '';
      if (widthSelect) widthSelect.value = '';
      applyFilter();
    });
  });

  [diameterSelect, profileSelect, widthSelect].forEach((select) => {
    if (!select) return;
    select.addEventListener('change', applyFilter);
  });

  // Initial run to set available options
  applyFilter();
});
