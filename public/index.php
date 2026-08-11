<?php

declare(strict_types=1);

use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;

// Корень ищем по маркеру уровнем выше, а не по наличию config рядом: в докруте лежит симлинк
// `config -> ../config`, is_dir() идёт по нему, и корнем становился сам public/. Пока рядом был
// симлинк на .env, это сходилось; после его удаления из докрута (утечка .env, 09.08.2026)
// конфиг перестал читаться вовсе. На плоском проде родителя-проекта нет — корнем остаётся docroot.
$projectRoot = is_file(dirname(__DIR__) . '/composer.json') ? dirname(__DIR__) : __DIR__;
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
