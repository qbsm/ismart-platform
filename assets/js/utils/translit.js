// Транслитерация русских названий городов в URL-slug и обратно.
// Используется на /buy для синхронизации <select> города с URL: /buy/moscow.

const CYRILLIC_TO_LATIN = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

// Известные английские названия для крупных городов.
// Если города нет в списке — fallback на побуквенную транслитерацию.
const CITY_OVERRIDES = {
  москва: 'moscow',
  'санкт-петербург': 'saint-petersburg',
  'нижний новгород': 'nizhny-novgorod',
  'ростов-на-дону': 'rostov-on-don',
  екатеринбург: 'ekaterinburg',
  новосибирск: 'novosibirsk',
  казань: 'kazan',
  красноярск: 'krasnoyarsk',
  челябинск: 'chelyabinsk',
  самара: 'samara',
  уфа: 'ufa',
  пермь: 'perm',
  воронеж: 'voronezh',
  волгоград: 'volgograd',
  краснодар: 'krasnodar',
  сочи: 'sochi',
  тюмень: 'tyumen',
  ярославль: 'yaroslavl',
  тольятти: 'togliatti',
};

function transliterate(value) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => (char in CYRILLIC_TO_LATIN ? CYRILLIC_TO_LATIN[char] : char))
    .join('');
}

export function cityToSlug(city) {
  const normalized = (city || '').toString().trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  const override = CITY_OVERRIDES[normalized];
  const base = override || transliterate(normalized);
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function slugToCity(slug, cities) {
  const target = (slug || '').toString().trim().toLowerCase();
  if (!target || !Array.isArray(cities)) {
    return '';
  }
  for (const city of cities) {
    if (cityToSlug(city) === target) {
      return city;
    }
  }
  return '';
}
