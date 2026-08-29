/**
 * Строит полный URL по baseUrl и относительному path.
 * Используется в main.js как window.url(path) с baseUrl из appConfig.
 * @param {string} baseUrl — базовый URL (с trailing slash или без)
 * @param {string} path — относительный путь (с ведущим слешем или без)
 * @returns {string}
 */
export function buildUrl(baseUrl, path) {
  const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
  const base = typeof baseUrl !== 'string' || baseUrl === '' ? '/' : baseUrl;
  const baseNorm = base.endsWith('/') ? base : base + '/';
  return baseNorm + trimmedPath;
}
