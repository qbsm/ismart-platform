<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Добавляет X-Request-Id к запросу и ответу для трассировки (логи, поддержка).
 */
final class CorrelationIdMiddleware implements MiddlewareInterface
{
    private const HEADER_NAME = 'X-Request-Id';
    public const REQUEST_ATTRIBUTE = 'request_id';

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $requestId = $request->getHeaderLine(self::HEADER_NAME);
        if ($requestId === '') {
            $requestId = bin2hex(random_bytes(16));
        }
        $request = $request->withAttribute(self::REQUEST_ATTRIBUTE, $requestId);
        $response = $handler->handle($request);

        return $response->withHeader(self::HEADER_NAME, $requestId);
    }
}
