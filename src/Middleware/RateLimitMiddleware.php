<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Rate limiting для POST /api/send: ограничение запросов по IP в скользящем окне.
 * Конфиг: settings['rate_limit_api_send'] => [ 'max_requests' => 10, 'window_seconds' => 60 ].
 * Хранилище: файлы в cache/rate_limit/ (по хешу IP).
 */
final class RateLimitMiddleware implements MiddlewareInterface
{
    private const TARGET_PATH = '/api/send';

    /** @var array{max_requests?: int, window_seconds?: int} */
    private array $config;

    private string $cacheDir;

    public function __construct(
        ResponseFactoryInterface $responseFactory,
        array $config,
        string $cacheDir
    ) {
        $this->responseFactory = $responseFactory;
        $this->config = $config;
        $this->cacheDir = rtrim($cacheDir, '/') . '/rate_limit';
    }

    private ResponseFactoryInterface $responseFactory;

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = $request->getUri()->getPath();
        $method = $request->getMethod();

        if ($method !== 'POST' || $path !== self::TARGET_PATH) {
            return $handler->handle($request);
        }

        $max = (int) ($this->config['max_requests'] ?? 10);
        $window = (int) ($this->config['window_seconds'] ?? 60);
        if ($max < 1 || $window < 1) {
            return $handler->handle($request);
        }

        $ip = $this->getClientIp($request);
        $key = md5($ip);
        $file = $this->cacheDir . '/' . $key . '.json';

        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }

        $now = time();
        $data = ['count' => 0, 'window_start' => $now];
        if (is_readable($file)) {
            $raw = (string) @file_get_contents($file);
            $decoded = json_decode($raw, true);
            if (is_array($decoded) && isset($decoded['window_start'], $decoded['count'])) {
                if ($now - (int) $decoded['window_start'] < $window) {
                    $data = ['count' => (int) $decoded['count'], 'window_start' => (int) $decoded['window_start']];
                }
            }
        }

        $data['count']++;
        @file_put_contents($file, (string) json_encode($data), LOCK_EX);

        if ($data['count'] > $max) {
            $response = $this->responseFactory->createResponse(429);
            $response->getBody()->write((string) json_encode([
                'success' => false,
                'code' => 'RATE_LIMIT_EXCEEDED',
                'message' => 'Слишком много запросов. Попробуйте позже.',
            ], JSON_UNESCAPED_UNICODE));
            $retryAfter = $window - ($now - $data['window_start']);
            if ($retryAfter > 0) {
                $response = $response->withHeader('Retry-After', (string) $retryAfter);
            }
            return $response->withHeader('Content-Type', 'application/json');
        }

        return $handler->handle($request);
    }

    private function getClientIp(ServerRequestInterface $request): string
    {
        $server = $request->getServerParams();
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            $parts = array_map('trim', explode(',', $forwarded));
            return $parts[0];
        }
        return (string) ($server['REMOTE_ADDR'] ?? '127.0.0.1');
    }
}
