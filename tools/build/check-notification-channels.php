<?php

declare(strict_types=1);

/**
 * Диагностика статуса notification-каналов по текущему .env.
 *
 * Печатает таблицу включённых/выключенных каналов и причину disabled.
 * Не дёргает реальные API, не отправляет тестовые заявки.
 * Используется в build pipeline (npm run build / build:dev).
 */

require __DIR__ . '/../../vendor/autoload.php';

$projectRoot = realpath(__DIR__ . '/../..');
if ($projectRoot === false) {
    fwrite(STDERR, "channels:check — не нашёл project root\n");
    exit(1);
}

if (is_file($projectRoot . '/.env')) {
    Dotenv\Dotenv::createImmutable($projectRoot)->safeLoad();
}

$env = static function (string $key): string {
    $value = getenv($key);
    if ($value === false) {
        $value = $_ENV[$key] ?? '';
    }
    return (string) $value;
};

$bool = static fn(string $key): bool => filter_var($env($key), FILTER_VALIDATE_BOOLEAN);

$mask = static function (string $value, int $keep = 4): string {
    if ($value === '') {
        return '(empty)';
    }
    if (strlen($value) <= $keep) {
        return str_repeat('*', strlen($value));
    }
    return substr($value, 0, $keep) . str_repeat('*', max(strlen($value) - $keep, 0));
};

$credentialsPath = $env('SHEETS_CREDENTIALS_PATH');
$credentialsAbs = $credentialsPath === ''
    ? ''
    : (str_starts_with($credentialsPath, '/') ? $credentialsPath : $projectRoot . '/' . ltrim($credentialsPath, '/'));

$channels = [
    'rescue' => (function () use ($env, $bool): array {
        $reasons = [];
        if (!$bool('RESCUE_ENABLE')) {
            $reasons[] = 'RESCUE_ENABLE=' . ($env('RESCUE_ENABLE') ?: 'false');
        }
        if ($env('RESCUE_SITE') === '') {
            $reasons[] = 'RESCUE_SITE пуст';
        }
        if ($reasons === []) {
            // Ключ нужен только вне нашего периметра: обычно приёмник подтверждает
            // отправителя по домену, и RESCUE_KEY пуст — это норма, а не недонастройка.
            $how = $env('RESCUE_KEY') !== '' ? 'по ключу' : 'по домену';
            return ['enabled' => true, 'detail' => 'site=' . $env('RESCUE_SITE') . ', подтверждение ' . $how];
        }
        return ['enabled' => false, 'detail' => implode(', ', $reasons)];
    })(),
    'mail' => [
        'enabled' => $env('MAIL_TO') !== '',
        'detail' => $env('MAIL_TO') !== ''
            ? 'MAIL_TO=' . $env('MAIL_TO')
            : 'MAIL_TO пуст',
    ],
    'calltouch' => (function () use ($env, $bool, $mask): array {
        $reasons = [];
        if (!$bool('CALLTOUCH_ENABLE')) {
            $reasons[] = 'CALLTOUCH_ENABLE=' . ($env('CALLTOUCH_ENABLE') ?: 'false');
        }
        // Два режима: автопрозвон (route_key + token) либо регистрация заявки (site_id)
        $hasCallback = $env('CALLTOUCH_ROUTE_KEY') !== '' && $env('CALLTOUCH_TOKEN') !== '';
        $hasRequest = $env('CALLTOUCH_SITE_ID') !== '';
        if (!$hasCallback && !$hasRequest) {
            $reasons[] = 'нужен CALLTOUCH_ROUTE_KEY+CALLTOUCH_TOKEN (автопрозвон) либо CALLTOUCH_SITE_ID (заявка)';
        }
        if ($reasons === []) {
            $detail = $hasCallback
                ? 'автопрозвон: route_key=' . $mask($env('CALLTOUCH_ROUTE_KEY')) . ', token=' . $mask($env('CALLTOUCH_TOKEN'))
                : 'заявка: site_id=' . $env('CALLTOUCH_SITE_ID');
            return ['enabled' => true, 'detail' => $detail];
        }
        return ['enabled' => false, 'detail' => implode(', ', $reasons)];
    })(),
    'telegram' => (function () use ($env, $bool): array {
        $reasons = [];
        if (!$bool('TELEGRAM_ENABLE')) {
            $reasons[] = 'TELEGRAM_ENABLE=' . ($env('TELEGRAM_ENABLE') ?: 'false');
        }
        if ($env('TELEGRAM_BOT_TOKEN') === '') {
            $reasons[] = 'TELEGRAM_BOT_TOKEN пуст';
        }
        if ($env('TELEGRAM_CHAT_ID') === '') {
            $reasons[] = 'TELEGRAM_CHAT_ID пуст';
        }
        if ($reasons === []) {
            return ['enabled' => true, 'detail' => 'chat_id=' . $env('TELEGRAM_CHAT_ID')];
        }
        return ['enabled' => false, 'detail' => implode(', ', $reasons)];
    })(),
    'google_sheets' => (function () use ($env, $bool, $credentialsAbs): array {
        $reasons = [];
        if (!$bool('SHEETS_ENABLE')) {
            $reasons[] = 'SHEETS_ENABLE=' . ($env('SHEETS_ENABLE') ?: 'false');
        }
        if ($env('SHEETS_SPREADSHEET_ID') === '') {
            $reasons[] = 'SHEETS_SPREADSHEET_ID пуст';
        }
        if ($credentialsAbs === '' || !is_readable($credentialsAbs)) {
            $reasons[] = 'creds не найден (' . ($env('SHEETS_CREDENTIALS_PATH') ?: '?') . ')';
        }
        if ($reasons === []) {
            return [
                'enabled' => true,
                'detail' => 'spreadsheet=' . $env('SHEETS_SPREADSHEET_ID') . ', sheet=' . ($env('SHEETS_SHEET_NAME') ?: 'Заявки'),
            ];
        }
        return ['enabled' => false, 'detail' => implode(', ', $reasons)];
    })(),
];

$tag = static fn(bool $enabled): string => $enabled ? '[ON] ' : '[off]';

echo "\nNotification channels:\n";
foreach ($channels as $name => $info) {
    printf("  %s %-14s %s\n", $tag($info['enabled']), $name, $info['detail']);
}
echo "\n";

exit(0);
