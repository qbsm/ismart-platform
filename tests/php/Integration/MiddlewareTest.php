<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\UriFactory;

final class MiddlewareTest extends TestCase
{
    private static ?\Slim\App $app = null;

    public static function setUpBeforeClass(): void
    {
        $projectRoot = dirname(__DIR__, 2);
        if (!is_file($projectRoot . '/vendor/autoload.php')) {
            return;
        }
        require $projectRoot . '/vendor/autoload.php';
        Dotenv::createImmutable($projectRoot)->safeLoad();
        $container = (require $projectRoot . '/config/container.php')();
        self::$app = Bridge::create($container);
        (require $projectRoot . '/config/middleware.php')(self::$app);
        (require $projectRoot . '/config/routes.php')(self::$app);
    }

    public function testTrailingSlashRedirect(): void
    {
        if (self::$app === null) {
            self::markTestSkipped('App not bootstrapped');
        }
        $uri = (new UriFactory())->createUri('http://localhost');
        $request = (new ServerRequestFactory())->createServerRequest('GET', $uri->withPath('/contacts'));
        $response = self::$app->handle($request);
        self::assertSame(301, $response->getStatusCode());
        self::assertStringContainsString('/contacts/', $response->getHeaderLine('Location'));
    }

    public function testLanguageDetectionFromUrl(): void
    {
        if (self::$app === null) {
            self::markTestSkipped('App not bootstrapped');
        }
        $uri = (new UriFactory())->createUri('http://localhost/en/');
        $request = (new ServerRequestFactory())->createServerRequest('GET', $uri);
        $response = self::$app->handle($request);
        self::assertSame(200, $response->getStatusCode());
    }
}
