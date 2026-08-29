<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Log\LoggerInterface;

/**
 * Измеряет время обработки запроса и логирует результат в JSON-формате.
 *
 * Добавляет заголовок X-Response-Time к ответу.
 * Логирует: request_id, method, path, status, duration_ms.
 */
final class RequestDurationMiddleware implements MiddlewareInterface
{
    public function __construct(private LoggerInterface $logger) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $start = hrtime(true);
        $response = $handler->handle($request);
        $durationMs = (hrtime(true) - $start) / 1_000_000;

        $this->logger->info('request_completed', [
            'request_id'  => (string) $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, ''),
            'method'      => $request->getMethod(),
            'path'        => $request->getUri()->getPath(),
            'status'      => $response->getStatusCode(),
            'duration_ms' => round($durationMs, 2),
        ]);

        return $response->withHeader('X-Response-Time', round($durationMs, 2) . 'ms');
    }
}
