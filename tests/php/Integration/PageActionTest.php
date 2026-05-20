<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use DI\Bridge\Slim\Bridge;
use Dotenv\Dotenv;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\UriFactory;

final class PageActionTest extends TestCase
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

    public function testGetRootReturns200(): void
    {
        if (self::$app === null) {
            self::markTestSkipped('App not bootstrapped');
        }
        $request = $this->createRequest('GET', '/');
        $response = self::$app->handle($request);
        self::assertSame(200, $response->getStatusCode());
        self::assertStringContainsString('text/html', $response->getHeaderLine('Content-Type'));
    }

    public function testGetNonexistentPageReturns404(): void
    {
        if (self::$app === null) {
            self::markTestSkipped('App not bootstrapped');
        }
        $request = $this->createRequest('GET', '/nonexistent-page-route-12345/');
        $response = self::$app->handle($request);
        self::assertSame(404, $response->getStatusCode());
    }

    private function createRequest(string $method, string $path): ServerRequestInterface
    {
        $uri = (new UriFactory())->createUri('http://localhost' . $path);
        return (new ServerRequestFactory())->createServerRequest($method, $uri);
    }
}
