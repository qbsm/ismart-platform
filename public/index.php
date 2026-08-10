<?php

declare(strict_types=1);

use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;

$projectRoot = is_dir(__DIR__ . '/config') ? __DIR__ : dirname(__DIR__);
require $projectRoot . '/vendor/autoload.php';

Dotenv::createUnsafeImmutable($projectRoot)->safeLoad();

// Часовое пояс приложения. Серверы живут в UTC, и без этого письмо о заявке приходило со
// временем на три часа раньше, чем человек её отправил.
date_default_timezone_set((string) (getenv('APP_TIMEZONE') ?: 'Europe/Moscow'));

$containerFactory = require $projectRoot . '/config/container.php';
$container = $containerFactory();

$app = Bridge::create($container);

$middleware = require $projectRoot . '/config/middleware.php';
$middleware($app);

$routes = require $projectRoot . '/config/routes.php';
$routes($app);

$app->run();
