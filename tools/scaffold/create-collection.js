const path = require('path');
const {
  PROJECT_ROOT,
  getAvailableLangs,
  getExistingSlugs,
  validateSlug,
  singularize,
  writeIfNotExists,
} = require('./utils');

// --- Аргументы ---
const args = process.argv.slice(2);
const slug = args[0];

if (!slug) {
  console.error('Использование: npm run create-collection -- <slug>');
  console.error('Пример:        npm run create-collection -- products');
  process.exit(1);
}

// --- Валидация ---
const slugError = validateSlug(slug);
if (slugError) {
  console.error(`Ошибка: ${slugError}`);
  process.exit(1);
}

const existingSlugs = getExistingSlugs();
if (existingSlugs.has(slug)) {
  console.error(`Ошибка: slug "${slug}" уже используется (страница, коллекция или зарезервировано)`);
  process.exit(1);
}

// --- Конфигурация ---
const singular = singularize(slug);
const itemKey = 'item';
const ogType = 'website';
const fixturesSlugs = ['example-1', 'example-2', 'example-3'];

const config = {
  nav_slug: slug,
  list_page_id: slug,
  template: `pages/${singular}.twig`,
  item_key: itemKey,
  data_dir: slug,
  slugs_source: 'items',
  og_type: ogType,
  extras_key: singular,
};

console.log(`\nСоздание коллекции "${slug}" (singular: "${singular}")\n`);

// --- Языки ---
const langs = getAvailableLangs();
console.log(`Языки: ${langs.join(', ')}\n`);

// --- Генерация файлов ---
const jsonBase = path.join(PROJECT_ROOT, 'data', 'json');

for (const lang of langs) {
  console.log(`--- Язык: ${lang} ---`);

  // 1. Страница-список: data/json/{lang}/pages/{slug}.json
  const listPageData = {
    name: slug,
    items: fixturesSlugs,
    sections: [
      { name: 'header', data: {} },
      { name: slug, data: { items: fixturesSlugs } },
      { name: 'footer', data: {} },
    ],
  };
  writeIfNotExists(path.join(jsonBase, lang, 'pages', `${slug}.json`), JSON.stringify(listPageData, null, 2));

  // 2. Директория сущностей + 3 fixtures
  for (let i = 0; i < fixturesSlugs.length; i++) {
    const fSlug = fixturesSlugs[i];
    const num = i + 1;
    const entityData = {
      visible: true,
      [itemKey]: {
        name: `${capitalize(singular)} ${num}`,
        title: `${capitalize(singular)} ${num}`,
        cover: { src: '' },
        date: formatDate(num),
        desc: `Описание элемента ${num} коллекции «${slug}».`,
        lead: `Краткое описание элемента ${num}.`,
        body: `<p>Полное описание элемента ${num} коллекции «${slug}». Отредактируйте этот файл.</p>`,
      },
    };
    writeIfNotExists(path.join(jsonBase, lang, slug, `${fSlug}.json`), JSON.stringify(entityData, null, 2));
  }

  // 3. SEO: data/json/{lang}/seo/{slug}.json
  const seoData = {
    name: slug,
    title: '',
    meta: [
      { name: 'description', content: '' },
      { property: 'og:url', content: `/${slug}/` },
      { property: 'og:type', content: ogType },
      { property: 'og:title', content: '' },
      { property: 'og:description', content: '' },
      { property: 'og:site_name', content: '' },
      { property: 'og:image', content: '' },
    ],
  };
  writeIfNotExists(path.join(jsonBase, lang, 'seo', `${slug}.json`), JSON.stringify(seoData, null, 2));
}

// 4. Twig-шаблон детальной страницы
console.log('\n--- Twig-шаблон ---');
const twigContent = `{% extends 'base.twig' %}

{% block content %}
<div id="page-content">
  {% include 'sections/header.twig' with {'data': {}} %}
  <main class="section ${singular}-detail" role="main">
    <div class="container">
      {% set e = ${singular}.${itemKey} %}
      <article class="${singular}-detail__article">
        {% if breadcrumb is defined and breadcrumb|length > 0 %}
          <nav class="${singular}-detail__breadcrumb" aria-label="Хлебные крошки">
            {% for item in breadcrumb %}
              <a href="{{ item.url }}">{{ item.name }}</a>{% if not loop.last %} <span class="${singular}-detail__breadcrumb-sep" aria-hidden="true">/</span> {% endif %}
            {% endfor %}
          </nav>
        {% endif %}
        {% if e.cover is defined and e.cover.src %}
          <div class="${singular}-detail__cover-wrap">
            <div class="${singular}-detail__cover" style="background-image: url('{{ url(e.cover.src) }}');"></div>
          </div>
        {% endif %}
        {% if e.date is defined %}<time class="${singular}-detail__date">{{ e.date | raw }}</time>{% endif %}
        <h1 class="${singular}-detail__title font-2">{{ e.title | default(e.name) | raw }}</h1>
        {% if e.lead is defined and e.lead %}<p class="${singular}-detail__lead">{{ e.lead | raw }}</p>{% endif %}
        {% if e.body is defined and e.body %}<div class="${singular}-detail__body">{{ e.body | raw }}</div>{% endif %}
      </article>
    </div>
  </main>
  {% include 'sections/footer.twig' with {'data': global.footer|default({})} %}
</div>
{% endblock %}
`;
writeIfNotExists(path.join(PROJECT_ROOT, 'templates', 'pages', `${singular}.twig`), twigContent);

// --- Инструкция для project.php ---
console.log('\n========================================');
console.log('Добавьте в config/project.php:');
console.log('========================================\n');

console.log('// route_map — добавить, ЕСЛИ list_page_id отличается от slug:');
console.log(`// '${slug}' => '${config.list_page_id}',\n`);

console.log('// collections — добавить:');
console.log(`'${slug}' => [`);
console.log(`    'nav_slug'     => '${config.nav_slug}',`);
console.log(`    'list_page_id' => '${config.list_page_id}',`);
console.log(`    'template'     => '${config.template}',`);
console.log(`    'item_key'     => '${config.item_key}',`);
console.log(`    'data_dir'     => '${config.data_dir}',`);
console.log(`    'slugs_source' => '${config.slugs_source}',`);
console.log(`    'og_type'      => '${config.og_type}',`);
console.log(`    'extras_key'   => '${config.extras_key}',`);
console.log(`],\n`);

console.log('// sitemap_pages — добавить:');
console.log(`'${slug}',\n`);

console.log('========================================');
console.log('Готово!\n');

// --- Helpers ---

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
}
