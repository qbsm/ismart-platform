<?php

declare(strict_types=1);

use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;

$projectRoot = is_dir(__DIR__ . '/config') ? __DIR__ : dirname(__DIR__);
require $projectRoot . '/vendor/autoload.php';

Dotenv::createUnsafeImmutable($projectRoot)->safeLoad();

$containerFactory = require $projectRoot . '/config/container.php';
$container = $containerFactory();

$app = Bridge::create($container);

$middleware = require $projectRoot . '/config/middleware.php';
$middleware($app);

$routes = require $projectRoot . '/config/routes.php';
$routes($app);

$app->run();
