<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\Json;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Rate limiting публичных POST-эндпоинтов: ограничение запросов по IP в скользящем окне.
 * Конфиг: settings['rate_limit_api_send'] => [ 'max_requests' => 10, 'window_seconds' => 60,
 * 'paths' => ['/api/send'] ]. Deployment добавляет в 'paths' свои эндпоинты — правка ядра
 * для этого не нужна.
 * Хранилище: файлы в cache/rate_limit/ (по хешу IP).
 */
final class RateLimitMiddleware implements MiddlewareInterface
{
    private const DEFAULT_PATHS = ['/api/send'];

    /** @var array{max_requests?: int, window_seconds?: int, paths?: array<int,string>} */
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

        $targetPaths = $this->config['paths'] ?? self::DEFAULT_PATHS;

        if ($method !== 'POST' || !in_array(rtrim($path, '/') ?: '/', $targetPaths, true)) {
            return $handler->handle($request);
        }

        $max = (int) ($this->config['max_requests'] ?? 10);
        $window = (int) ($this->config['window_seconds'] ?? 60);
        if ($max < 1 || $window < 1) {
            return $handler->handle($request);
        }

        $ip = $this->getClientIp($request);
        // Счётчик свой на каждый путь: иначе копии контакта из виджета съедали бы лимит
        // обычной формы, и человек, потыкав виджет, не смог бы отправить заявку.
        $key = md5($ip . '|' . (rtrim($path, '/') ?: '/'));
        $file = $this->cacheDir . '/' . $key . '.json';

        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0o755, true);
        }

        $this->pruneExpired($window);

        $now = time();
        $data = ['count' => 0, 'window_start' => $now];
        $decoded = Json::load($file);
        if ($decoded !== null && isset($decoded['window_start'], $decoded['count'])
            && $now - (int) $decoded['window_start'] < $window
        ) {
            $data = ['count' => (int) $decoded['count'], 'window_start' => (int) $decoded['window_start']];
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

    /**
     * Счётчик на IP остаётся в cache/rate_limit навсегда, хотя после окна бесполезен.
     * Чистим отработавшие файлы примерно раз в сто запросов — скан директории на каждом
     * POST под ботовым наплывом сам стал бы нагрузкой.
     */
    private function pruneExpired(int $window): void
    {
        if (mt_rand(1, 100) !== 1) {
            return;
        }

        $deadline = time() - max($window * 10, 3600);
        foreach (glob($this->cacheDir . '/*.json') ?: [] as $file) {
            $mtime = @filemtime($file);
            if ($mtime !== false && $mtime < $deadline) {
                @unlink($file);
            }
        }
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
