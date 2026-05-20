const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT, validateSlug, writeIfNotExists } = require('./utils');

// --- Аргументы ---
const args = process.argv.slice(2);
const clientSlug = args[0];

if (!clientSlug) {
  console.error('Использование: npm run create-deployment -- <client-slug>');
  console.error('Пример:        npm run create-deployment -- retail-logistic');
  process.exit(1);
}

// --- Валидация ---
const slugError = validateSlug(clientSlug);
if (slugError) {
  console.error(`Ошибка: ${slugError}`);
  process.exit(1);
}

const deployDir = path.join(PROJECT_ROOT, 'deployments', clientSlug);
if (fs.existsSync(deployDir)) {
  console.error(`Ошибка: директория deployments/${clientSlug} уже существует`);
  process.exit(1);
}

console.log(`\nСоздание deployment "${clientSlug}"\n`);

// --- .env ---
writeIfNotExists(
  path.join(deployDir, '.env'),
  `# Deployment: ${clientSlug}
# Скопировано из .env.example — заполните значения

APP_ENV=development
APP_DEBUG=1
APP_BASE_URL=http://localhost:8080
APP_DEFAULT_LANG=ru

YANDEX_METRIC_ID=0

# n8n (Этап 4)
# N8N_BASE_URL=http://n8n:5678
# N8N_API_KEY=
# N8N_HMAC_SECRET=

# Django (Этап 4)
# DJANGO_CORE_URL=http://core-api:8000
# DJANGO_AGENTS_URL=http://agents-service:8001
# DJANGO_MAS_URL=http://mas-service:8002
# DJANGO_SERVICE_TOKEN=

# Auth (Этап 2)
# JWT_SECRET=
# JWT_TTL=3600
`
);

// --- .env.example ---
writeIfNotExists(
  path.join(deployDir, '.env.example'),
  `# Deployment: ${clientSlug}
# Скопируйте в .env и заполните значения

APP_ENV=development          # production | development
APP_DEBUG=1                  # 0 | 1
APP_BASE_URL=                # https://example.com (без trailing slash)
APP_DEFAULT_LANG=ru          # Язык по умолчанию

YANDEX_METRIC_ID=0           # ID Яндекс.Метрики

# n8n (Этап 4)
N8N_BASE_URL=                # http://n8n:5678
N8N_API_KEY=                 # API-ключ n8n
N8N_HMAC_SECRET=             # Секрет для HMAC-подписи

# Django (Этап 4)
DJANGO_CORE_URL=             # http://core-api:8000
DJANGO_AGENTS_URL=           # http://agents-service:8001
DJANGO_MAS_URL=              # http://mas-service:8002
DJANGO_SERVICE_TOKEN=        # Межсервисный токен

# Auth (Этап 2)
JWT_SECRET=                  # Секрет для JWT
JWT_TTL=3600                 # Время жизни токена (сек)
`
);

// --- docker-compose.yml ---
writeIfNotExists(
  path.join(deployDir, 'docker-compose.yml'),
  `version: "3.8"

services:
  php:
    image: php:8.5-fpm
    volumes:
      - ../../:/app
      - ./config/project.php:/app/config/project.php:ro
      - ./data:/app/data:ro
      - ./.env:/app/.env:ro
    working_dir: /app
    environment:
      - APP_ENV=\${APP_ENV:-development}

  nginx:
    image: nginx:alpine
    ports:
      - "\${APP_PORT:-8080}:80"
    volumes:
      - ../../public:/app/public:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - php

  # n8n (раскомментировать на Этапе 4)
  # n8n:
  #   image: n8nio/n8n:latest
  #   ports:
  #     - "5678:5678"
  #   environment:
  #     - N8N_BASIC_AUTH_ACTIVE=true
  #     - N8N_BASIC_AUTH_USER=admin
  #     - N8N_BASIC_AUTH_PASSWORD=\${N8N_ADMIN_PASSWORD}
  #   volumes:
  #     - n8n_data:/home/node/.n8n

# volumes:
#   n8n_data:
`
);

// --- nginx.conf ---
writeIfNotExists(
  path.join(deployDir, 'nginx.conf'),
  `server {
    listen 80;
    server_name _;
    root /app/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php$is_args$args;
    }

    location ~ \\.php$ {
        fastcgi_pass php:9000;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
`
);

// --- config/project.php ---
const distPath = path.join(PROJECT_ROOT, 'config', 'project.php.dist');
let projectPhpContent;
if (fs.existsSync(distPath)) {
  projectPhpContent = fs.readFileSync(distPath, 'utf8');
} else {
  projectPhpContent = `<?php\n\nreturn [\n    'route_map' => [],\n    'collections' => [],\n    'sitemap_pages' => ['index'],\n    'integrations' => [],\n];\n`;
}
writeIfNotExists(path.join(deployDir, 'config', 'project.php'), projectPhpContent);

// --- data/json/global.json ---
const globalData = {
  lang: [{ title: 'Русский', code: 'ru', direction: 'ltr' }],
  phones: [{ title: '+7 (000) 000-00-00', href: 'tel:+70000000000' }],
  nav: { ru: { items: [{ title: 'Главная', href: '/' }] } },
  footer: {},
};
writeIfNotExists(path.join(deployDir, 'data', 'json', 'global.json'), JSON.stringify(globalData, null, 2));

// --- data/json/ru/pages/index.json ---
const indexPage = {
  name: 'index',
  sections: [
    { name: 'header', data: {} },
    { name: 'intro', data: {} },
    { name: 'footer', data: {} },
  ],
};
writeIfNotExists(path.join(deployDir, 'data', 'json', 'ru', 'pages', 'index.json'), JSON.stringify(indexPage, null, 2));

// --- data/json/ru/seo/index.json ---
const indexSeo = {
  name: 'index',
  title: '',
  meta: [
    { name: 'description', content: '' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: '' },
    { property: 'og:description', content: '' },
  ],
};
writeIfNotExists(path.join(deployDir, 'data', 'json', 'ru', 'seo', 'index.json'), JSON.stringify(indexSeo, null, 2));

// --- README.md ---
writeIfNotExists(
  path.join(deployDir, 'README.md'),
  `# Deployment: ${clientSlug}

## Быстрый старт

1. Скопируйте \`.env.example\` в \`.env\` и заполните значения
2. Отредактируйте \`config/project.php\` — маршруты, коллекции, sitemap
3. Заполните данные в \`data/json/\`

### Запуск через Docker

\`\`\`bash
docker compose up -d
\`\`\`

Сайт будет доступен по адресу: \`http://localhost:\${APP_PORT:-8080}\`

### Запуск через PHP dev-server

\`\`\`bash
# Из корня платформы
cp deployments/${clientSlug}/.env .env
cp deployments/${clientSlug}/config/project.php config/project.php
php -S localhost:8080 -t public
\`\`\`

## Структура

\`\`\`
${clientSlug}/
  .env                  # Переменные окружения
  .env.example          # Шаблон .env
  docker-compose.yml    # Docker конфигурация
  nginx.conf            # Nginx конфигурация
  config/
    project.php         # Проектная конфигурация (route_map, collections, sitemap)
  data/
    json/
      global.json       # Глобальные данные (навигация, контакты, языки)
      ru/pages/         # Страницы
      ru/seo/           # SEO-данные
\`\`\`
`
);

console.log('\n========================================');
console.log(`Deployment "${clientSlug}" создан в deployments/${clientSlug}/`);
console.log('========================================');
console.log('\nСледующие шаги:');
console.log(`  1. cd deployments/${clientSlug}`);
console.log('  2. cp .env.example .env && отредактируйте .env');
console.log('  3. Отредактируйте config/project.php');
console.log('  4. docker compose up -d');
console.log('');
