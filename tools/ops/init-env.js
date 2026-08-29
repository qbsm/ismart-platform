/**
 * npm run init — запрос базовых настроек и создание/обновление .env.
 * Запускается из корня проекта.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const projectRoot = path.resolve(__dirname, '../..');
const envPath = path.join(projectRoot, '.env');
const examplePath = path.join(projectRoot, '.env.example');

const REQUIRED = {
  APP_BASE_URL: {
    prompt: 'APP_BASE_URL (базовый URL сайта)',
    default: 'http://localhost/',
    placeholder: 'https://example.test/',
  },
  APP_ENV: {
    prompt: 'APP_ENV (development / production)',
    default: 'development',
    placeholder: null,
  },
  APP_DEFAULT_LANG: {
    prompt: 'APP_DEFAULT_LANG (код языка по умолчанию)',
    default: 'ru',
    placeholder: null,
  },
};

const OPTIONAL = {
  APP_DEBUG: {
    prompt: 'APP_DEBUG (1 — включить отладку, 0 — выключить)',
    default: '1',
  },
  YANDEX_METRIC_ID: {
    prompt: 'YANDEX_METRIC_ID (ID счётчика Метрики, 0 — не использовать)',
    default: '0',
  },
};

function parseEnv(content) {
  const map = {};
  const lines = (content || '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      map[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return map;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, 'utf8'));
}

function ask(rl, text, defaultValue) {
  const def = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`${text}${def}: `, (answer) => {
      const v = (answer || defaultValue || '').trim();
      resolve(v);
    });
  });
}

async function main() {
  let env = {};
  let exampleContent;

  if (fs.existsSync(examplePath)) {
    exampleContent = fs.readFileSync(examplePath, 'utf8');
    env = parseEnv(exampleContent);
  }

  if (fs.existsSync(envPath)) {
    const existing = readEnvFile(envPath);
    env = { ...env, ...existing };
  } else {
    console.log('Файл .env не найден. Создаю из .env.example...');
    fs.copyFileSync(examplePath, envPath);
    env = readEnvFile(envPath);
  }

  const allRequiredSet = Object.keys(REQUIRED).every((key) => {
    const v = (env[key] || '').trim();
    const { placeholder } = REQUIRED[key];
    return v && (!placeholder || v !== placeholder);
  });
  if (allRequiredSet) {
    console.log('Все обязательные переменные в .env уже заданы. Пропуск запроса.');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let needWrite = false;

  console.log('\n--- Сначала укажите обязательные настройки ---\n');
  for (const [key, { prompt, default: def, placeholder }] of Object.entries(REQUIRED)) {
    const current = (env[key] || '').trim();
    const isEmptyOrPlaceholder = !current || (placeholder && current === placeholder);
    if (isEmptyOrPlaceholder) {
      const value = await ask(rl, prompt, def);
      if (value) {
        env[key] = value;
        needWrite = true;
      } else if (def) {
        env[key] = def;
        needWrite = true;
      }
    }
  }

  console.log('');
  const askOptional = await ask(rl, 'Хотите указать дополнительные переменные? (y/n)', 'n');
  if (/^y|yes|д|да$/i.test(askOptional.trim())) {
    console.log('\n--- Дополнительные настройки ---\n');
    for (const [key, { prompt, default: def }] of Object.entries(OPTIONAL)) {
      const current = (env[key] || '').trim();
      const value = await ask(rl, prompt, current || def);
      if (value !== undefined && value !== '') {
        env[key] = value;
        needWrite = true;
      }
    }
  }

  rl.close();

  if (needWrite) {
    const template = fs.readFileSync(envPath, 'utf8');
    const lines = template.split(/\r?\n/);
    const out = [];
    const written = new Set();
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && env[m[1]] !== undefined) {
        out.push(`${m[1]}=${env[m[1]]}`);
        written.add(m[1]);
      } else {
        out.push(line);
      }
    }
    for (const key of [...Object.keys(REQUIRED), ...Object.keys(OPTIONAL)]) {
      if (!written.has(key) && env[key] !== undefined) {
        out.push(`${key}=${env[key]}`);
      }
    }
    fs.writeFileSync(envPath, out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
    console.log('Обновлён .env');
  } else {
    console.log('Все обязательные переменные заданы. .env не изменён.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
