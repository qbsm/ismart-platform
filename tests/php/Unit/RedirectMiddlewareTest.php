<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Middleware\RedirectMiddleware;
use App\Support\BaseUrlResolver;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

final class RedirectMiddlewareTest extends TestCase
{
    private string $mapPath = '';

    protected function tearDown(): void
    {
        if ($this->mapPath !== '' && is_file($this->mapPath)) {
            unlink($this->mapPath);
        }
    }

    public function testPrefixRuleKeepsPathTail(): void
    {
        $response = $this->handle('/tires-list/wp52-plus', [
            ['from_prefix' => '/tires-list/', 'to_prefix' => '/tires', 'status' => 301],
        ]);

        self::assertSame(301, $response->getStatusCode());
        self::assertStringEndsWith('/tires/wp52-plus', $response->getHeaderLine('Location'));
    }

    public function testPrefixRuleMatchesBarePrefix(): void
    {
        $response = $this->handle('/tires-list', [
            ['from_prefix' => '/tires-list/', 'to_prefix' => '/tires', 'status' => 301],
        ]);

        self::assertSame(301, $response->getStatusCode());
        self::assertStringEndsWith('/tires', $response->getHeaderLine('Location'));
    }

    public function testPrefixRuleDoesNotMatchSimilarPath(): void
    {
        $response = $this->handle('/tires-listing/at52', [
            ['from_prefix' => '/tires-list/', 'to_prefix' => '/tires', 'status' => 301],
        ]);

        self::assertSame(200, $response->getStatusCode());
    }

    public function testExactRuleStillWins(): void
    {
        $response = $this->handle('/buy/saint', [
            ['from' => '/buy/saint', 'to' => '/buy/saint-petersburg', 'status' => 301],
        ]);

        self::assertSame(301, $response->getStatusCode());
        self::assertStringEndsWith('/buy/saint-petersburg', $response->getHeaderLine('Location'));
    }

    public function testПравилоСрабатываетНезависимоОтРегистра(): void
    {
        $response = $this->handle('/JOLI', [
            ['from' => '/joli', 'to' => '/restaurants/joli-grand-bistrot'],
        ]);

        self::assertSame(301, $response->getStatusCode());
        self::assertStringEndsWith('/restaurants/joli-grand-bistrot', $response->getHeaderLine('Location'));
    }

    public function testПрефиксТожеБезРегистра(): void
    {
        $response = $this->handle('/Tires-List/WP52', [
            ['from_prefix' => '/tires-list/', 'to_prefix' => '/tires'],
        ]);

        self::assertSame(301, $response->getStatusCode());
        self::assertStringEndsWith('/tires/WP52', $response->getHeaderLine('Location'));
    }

    public function testIncompleteRuleIsIgnored(): void
    {
        $response = $this->handle('/tires-list/at52', [
            ['from_prefix' => '/tires-list/'],
            ['to' => '/tires'],
        ]);

        self::assertSame(200, $response->getStatusCode());
    }

    /**
     * @param array<int,array<string,mixed>> $rules
     */
    private function handle(string $path, array $rules): ResponseInterface
    {
        $this->mapPath = (string) tempnam(sys_get_temp_dir(), 'redirects') . '.json';
        file_put_contents($this->mapPath, (string) json_encode($rules));

        $middleware = new RedirectMiddleware(
            ['paths' => ['redirects' => $this->mapPath]],
            new ResponseFactory(),
            new BaseUrlResolver()
        );

        $request = new ServerRequestFactory()->createServerRequest('GET', 'http://localhost' . $path);
        $handler = new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return new ResponseFactory()->createResponse(200);
            }
        };

        return $middleware->process($request, $handler);
    }
}
