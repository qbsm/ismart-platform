<?php

$projectRoot = dirname(__DIR__);

// APP_ENV: production | development — разделение окружений (кэш Twig, уровень логов)
$appEnv = (string) (getenv('APP_ENV') ?: 'development');
$isProduction = $appEnv === 'production';

$debugValue = (string) (getenv('APP_DEBUG') ?: ($isProduction ? '0' : '1'));
$isDebug = in_array(strtolower($debugValue), ['1', 'true', 'yes', 'on'], true);

$cacheDir = $projectRoot . '/cache';

// Единый источник языков — data/json/global.json → lang (code, title, direction)
$jsonGlobalPath = $projectRoot . '/data/json/global.json';
$available_langs = ['ru', 'en'];
$default_lang = (string) (getenv('APP_DEFAULT_LANG') ?: 'ru');
if (is_readable($jsonGlobalPath)) {
    $global = json_decode((string) file_get_contents($jsonGlobalPath), true);
    if (isset($global['lang']) && is_array($global['lang'])) {
        $available_langs = array_values(array_filter(array_map(
            static function ($item) {
                return is_array($item) && isset($item['code']) ? (string) $item['code'] : null;
            },
            $global['lang']
        )));
        if ($available_langs === []) {
            $available_langs = ['ru', 'en'];
        }
        if (!getenv('APP_DEFAULT_LANG') && isset($global['lang'][0]['code'])) {
            $default_lang = (string) $global['lang'][0]['code'];
        }
    }
}
$envDefaultLang = getenv('APP_DEFAULT_LANG');
if ($envDefaultLang !== false && $envDefaultLang !== '') {
    $default_lang = (string) $envDefaultLang;
}

// Ключи и ширины для адаптивных изображений (picture.twig, tools/build) — единый источник
// Проектная конфигурация (route_map, collections, sitemap_pages, integrations)
$projectConfigPath = __DIR__ . '/project.php';
$projectConfig = is_file($projectConfigPath) ? (array) require $projectConfigPath : [];

$imageSizesPath = __DIR__ . '/image-sizes.json';
$image_sizes = [
    'keys' => ['800', '1600', 'raw'],
    'widths' => ['800' => 800, '1600' => 1600, 'raw' => null],
];
if (is_readable($imageSizesPath)) {
    $imageSizesData = json_decode((string) file_get_contents($imageSizesPath), true);
    if (is_array($imageSizesData)) {
        if (isset($imageSizesData['keys']) && is_array($imageSizesData['keys'])) {
            $image_sizes['keys'] = array_values($imageSizesData['keys']);
        }
        if (isset($imageSizesData['widths']) && is_array($imageSizesData['widths'])) {
            $image_sizes['widths'] = $imageSizesData['widths'];
        }
    }
}

return [
    'project_root' => $projectRoot,
    'env' => $appEnv,
    'debug' => $isDebug,
    'default_lang' => $default_lang,
    'available_langs' => $available_langs,
    'yandex_metric_id' => (int) (getenv('YANDEX_METRIC_ID') ?: 0),
    // slug в URL => page_id (из project.php)
    'route_map' => (array) ($projectConfig['route_map'] ?? []),
    // Конфигурация коллекций (из project.php)
    'collections' => (array) ($projectConfig['collections'] ?? []),
    // page_id страниц для sitemap.xml (из project.php)
    'sitemap_pages' => (array) ($projectConfig['sitemap_pages'] ?? ['index']),
    // Динамические подпути для sitemap (из project.php): page => {data_page, list_key, value_key, slugger}
    'sitemap_dynamic_pages' => (array) ($projectConfig['sitemap_dynamic_pages'] ?? []),
    // Rate limiting для POST /api/send (по IP, файловое хранилище в cache/rate_limit)
    'rate_limit_api_send' => [
        'max_requests' => 10,
        'window_seconds' => 60,
    ],
    'cors' => [
        'allowed_origins' => [], // например ['https://example.com'] или ['*'] для любого
        'allowed_methods' => ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
        'allowed_headers' => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
        'allow_credentials' => false,
    ],
    'mail' => [
        'dsn' => (string) (getenv('MAILER_DSN') ?: 'sendmail://default'),
        'to' => (string) (getenv('MAIL_TO') ?: ''),
        'from' => (string) (getenv('MAIL_FROM') ?: 'noreply@localhost'),
        'from_name' => (string) (getenv('MAIL_FROM_NAME') ?: ''),
        'subject_prefix' => (string) (getenv('MAIL_SUBJECT_PREFIX') ?: ''),
    ],
    'errors' => require __DIR__ . '/errors.php',
    'twig' => [
        'cache' => $isProduction ? $cacheDir . '/twig' : false,
        'debug' => $isDebug,
        'auto_reload' => !$isProduction,
    ],
    'paths' => [
        'templates' => $projectRoot . '/templates',
        'json_base' => $projectRoot . '/data/json',
        'json_global' => $projectRoot . '/data/json/global.json',
        'json_pages_dir' => $projectRoot . '/data/json/{lang}/pages',
        'redirects' => $projectRoot . '/config/redirects.json',
        'cache' => $cacheDir,
        'logs' => $projectRoot . '/logs',
    ],
    'image_sizes' => $image_sizes,
    'resource_hints' => [
        ['rel' => 'preconnect', 'href' => 'https://mc.yandex.ru', 'crossorigin' => false],
        ['rel' => 'preconnect', 'href' => 'https://yastatic.net', 'crossorigin' => false],
    ],
];
