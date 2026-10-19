/**
 * При финальной сборке (npm run build) проверяет, что в .env указан реальный домен.
 * Если APP_BASE_URL не задан или равен примеру (example.test, *.test, localhost) — выводит предупреждение.
 * Запускается из корня проекта.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const envPath = path.join(projectRoot, '.env');

const PLACEHOLDER_HOSTS = ['example.test', 'localhost', '127.0.0.1'];

function parseEnv(content) {
  const map = {};
  for (const line of (content || '').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) map[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return map;
}

function getHostFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.replace(/\/+$/, '') || 'http://x');
    return u.hostname || '';
  } catch {
    return '';
  }
}

function isPlaceholderHost(host) {
  if (!host) return true;
  if (PLACEHOLDER_HOSTS.includes(host)) return true;
  if (host.endsWith('.test')) return true;
  if (host.includes('example.')) return true;
  return false;
}

function main() {
  if (!fs.existsSync(envPath)) {
    console.warn(
      '\n[check-env-build] Файл .env не найден. Перед выкладкой на прод создайте .env и укажите APP_BASE_URL=https://ваш-домен\n'
    );
    process.exit(0);
    return;
  }

  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const baseUrl = (env.APP_BASE_URL || '').trim();
  const host = getHostFromUrl(baseUrl);

  const isEmpty = !baseUrl;
  const placeholder = isPlaceholderHost(host);

  if (isEmpty || placeholder) {
    console.warn(
      '\n[check-env-build] Предупреждение: для продакшена в .env должен быть указан реальный домен (не *.test и не example).\n' +
        '  Сейчас: APP_BASE_URL=' +
        (baseUrl || '(не задан)') +
        '\n' +
        '  Задайте, например: APP_BASE_URL=https://kumho-tires.ru\n'
    );
  }

  process.exit(0);
}

main();
