<?php

declare(strict_types=1);

/**
 * Очередь досылки в приёмник api.ismart.pro (RescueChannel / App\Support\RescueQueue) из консоли:
 *
 *   php tools/ops/rescue.php status   — сколько заявок ждёт и как давно
 *   php tools/ops/rescue.php flush    — дослать очередь сейчас (таймер раз в 15 мин)
 *
 * Настройки — RESCUE_* в .env (config/settings.php :: rescue).
 */

use App\Notification\Channel\RescueChannel;
use App\Support\RescueQueue;
use Dotenv\Dotenv;
use Psr\Log\LoggerInterface;

$root = dirname(__DIR__, 2);
require $root . '/vendor/autoload.php';
Dotenv::createUnsafeImmutable($root)->safeLoad();

$container = (require $root . '/config/container.php')();
$settings = $container->get('settings');
$channel = $container->get(RescueChannel::class);
$queue = new RescueQueue($container->get(LoggerInterface::class), (string) ($settings['paths']['logs'] ?? ''));
$command = $argv[1] ?? 'status';

if (!$channel->isEnabled()) {
    fwrite(STDERR, "канал приёмника выключен: RESCUE_ENABLE не true\n");
    exit(1);
}

if ($command === 'flush') {
    $done = $channel->flushQueue();
    echo 'доставлено: ' . $done['sent'] . ', осталось в очереди: ' . $done['left'] . "\n";
    exit(0);
}

$items = $queue->items();
$oldest = $items === [] ? 0 : min(array_map(static fn(array $i): int => $i['t'], $items));
echo 'в очереди: ' . count($items) . ($oldest > 0 ? ', самая давняя ждёт ' . (int) round((time() - $oldest) / 60) . ' мин' : '') . "\n";
