<?php

use App\Support\Env;

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

// Ключи проекта, которых ядро не знает (эквайринг, свои интеграции), доезжают в настройки
// как есть: иначе deployment'у приходится править синкаемый settings.php руками, а следующий
// distill затирает эту правку — так у italycommunity пропала конфигурация коллекций.
$projectExtraSettings = array_diff_key(
    $projectConfig,
    array_flip(['route_map', 'collections', 'sitemap_pages', 'sitemap_dynamic', 'integrations']),
);

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

return $projectExtraSettings + [
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
    // Rate limiting публичных POST-эндпоинтов (по IP, файловое хранилище в cache/rate_limit).
    // paths — список путей под лимитом; deployment дополняет своими (например оплатой).
    'rate_limit_api_send' => [
        'max_requests' => 10,
        'window_seconds' => 60,
        'paths' => ['/api/send', '/api/widget-rescue'],
    ],
    // Отсев роботов на форме. Значения зашиты в ядро и работают без .env; переопределяются
    // переменными точечно. Выключатель нужен для разбора жалоб «форма не отправляется»:
    // при `false` отказ не выносится, но срабатывание всё равно пишется в лог.
    //
    // trap_field принимает несколько имён через запятую: у части сайтов форм две и ловушки в
    // них исторически названы по-разному. Ловим любое заполненное — робот не разбирает, какое
    // из полей «настоящее».
    //
    // min_age_sec — единственный источник порога «набрано слишком быстро»; form_token берёт
    // его отсюда, чтобы выданный токен и проверка на отправке не разъезжались.
    'form_guard' => [
        'enable' => Env::bool('FORM_GUARD_ENABLE', true),
        'trap_field' => Env::get('FORM_GUARD_TRAP_FIELD') ?: 'company_site, website',
        'min_age_sec' => Env::int('FORM_GUARD_MIN_AGE_SEC', 3),
        // Обязательные поля формы — свойство площадки: форма подписки живёт без телефона.
        'required_fields' => Env::get('FORM_REQUIRED_FIELDS') ?: 'phone',
    ],
    // Токен формы выдаётся браузеру по запросу, а не вместе с HTML: страница, скачанная
    // роботом, не даёт возможности отправить заявку.
    'form_token' => [
        'max_age' => 7200,
        'secret_file' => $cacheDir . '/form-token-secret',
    ],
    // Капча Yandex SmartCaptcha. По умолчанию выключена: на большинстве сайтов роботов
    // отсекают токен формы и ловушка, а лишний барьер стоит конверсии. Включается точечно —
    // там, где спам действительно идёт.
    'captcha' => [
        'enable' => Env::bool('CAPTCHA_ENABLE'),
        'client_key' => Env::get('CAPTCHA_CLIENT_KEY'),
        'server_key' => Env::get('CAPTCHA_SERVER_KEY'),
        'timeout' => Env::int('CAPTCHA_TIMEOUT', 5),
    ],
    'cors' => [
        'allowed_origins' => [], // например ['https://example.com'] или ['*'] для любого
        'allowed_methods' => ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
        'allowed_headers' => ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
        'allow_credentials' => false,
    ],
    'mail' => [
        // Пусто — флага в .env нет, поведение прежнее: канал включён, если задан адрес.
        'enable' => Env::get('MAIL_ENABLE'),
        'dsn' => Env::get('MAIL_DSN') ?: 'sendmail://default',
        'to' => Env::get('MAIL_TO'),
        'from' => Env::get('MAIL_FROM') ?: 'noreply@localhost',
        'from_name' => Env::get('MAIL_FROM_NAME'),
        'subject_prefix' => Env::get('MAIL_SUBJECT_PREFIX'),
    ],
    // Резервный сбор заявок (rescue-канал): дублирует заявку в наш сервис, который сначала её
    // сохраняет, а потом раздаёт по каналам с повторами — упавший канал не теряет лид.
    // Подтверждение отправителя — по домену: заявку шлёт бэкенд, значит с адреса, на который
    // домен резолвится. Секрета в .env нет; ключ нужен только хостингам вне нашего периметра.
    'rescue' => [
        'enable' => Env::bool('RESCUE_ENABLE'),
        'url' => Env::get('RESCUE_URL') ?: 'https://api.ismart.pro/v1/rescue',
        'site' => Env::get('RESCUE_SITE'),
        'key' => Env::get('RESCUE_KEY'),
        'timeout' => Env::int('RESCUE_TIMEOUT', 3),
    ],

    'calltouch' => [
        'enable' => Env::bool('CALLTOUCH_ENABLE'),
        'route_key' => Env::get('CALLTOUCH_ROUTE_KEY'),
        'token' => Env::get('CALLTOUCH_TOKEN'),
        // Числовой ID личного кабинета (Интеграции → Отправка данных во внешние
        // системы → API). Включает режим регистрации заявки — без токена.
        'site_id' => Env::get('CALLTOUCH_SITE_ID'),
        'timeout' => Env::int('CALLTOUCH_TIMEOUT', 10),
    ],
    'telegram' => [
        'enable' => Env::bool('TELEGRAM_ENABLE'),
        'bot_token' => Env::get('TELEGRAM_BOT_TOKEN'),
        'chat_id' => Env::get('TELEGRAM_CHAT_ID'),
        'timeout' => Env::int('TELEGRAM_TIMEOUT', 10),
    ],
    'google_sheets' => [
        'enable' => Env::bool('SHEETS_ENABLE'),
        'spreadsheet_id' => Env::get('SHEETS_SPREADSHEET_ID'),
        'sheet_name' => Env::get('SHEETS_SHEET_NAME') ?: 'Заявки',
        'credentials_path' => Env::get('SHEETS_CREDENTIALS_PATH')
            ?: 'config/secrets/google-service-account.json',
        'timeout' => Env::int('SHEETS_TIMEOUT', 10),
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
