<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * CORS middleware: обрабатывает preflight (OPTIONS) и добавляет CORS-заголовки к ответам.
 * Подготовка для API и форм (отправка с других доменов).
 * Конфиг: settings['cors'] — allowed_origins[], allowed_methods[], allowed_headers[], allow_credentials.
 */
final class CorsMiddleware implements MiddlewareInterface
{
    private const DEFAULT_METHODS = ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'];
    private const DEFAULT_HEADERS = ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'];

    public function __construct(
        private ResponseFactoryInterface $responseFactory,
        private array $config = [],
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $allowedOrigins = $this->config['allowed_origins'] ?? [];
        if ($allowedOrigins === [] && $origin === '') {
            return $handler->handle($request);
        }

        $response = $request->getMethod() === 'OPTIONS'
            ? $this->handlePreflight($request)
            : $handler->handle($request);

        return $this->addCorsHeaders($response, $request, $allowedOrigins);
    }

    private function handlePreflight(ServerRequestInterface $request): ResponseInterface
    {
        $response = $this->responseFactory->createResponse(204);
        $response = $response->withHeader('Access-Control-Max-Age', '86400');
        return $response;
    }

    private function addCorsHeaders(ResponseInterface $response, ServerRequestInterface $request, array $allowedOrigins): ResponseInterface
    {
        $origin = $request->getHeaderLine('Origin');
        $allowOrigin = $this->resolveAllowOrigin($origin, $allowedOrigins);
        if ($allowOrigin === null) {
            return $response;
        }

        $response = $response->withHeader('Access-Control-Allow-Origin', $allowOrigin);

        $allowCredentials = (bool) ($this->config['allow_credentials'] ?? false);
        if ($allowCredentials) {
            $response = $response->withHeader('Access-Control-Allow-Credentials', 'true');
        }

        if ($request->getMethod() === 'OPTIONS') {
            $methods = $this->config['allowed_methods'] ?? self::DEFAULT_METHODS;
            $response = $response->withHeader('Access-Control-Allow-Methods', implode(', ', $methods));
            $requestHeaders = $request->getHeaderLine('Access-Control-Request-Headers');
            $allowedHeaders = $this->config['allowed_headers'] ?? self::DEFAULT_HEADERS;
            if ($requestHeaders !== '') {
                $response = $response->withHeader('Access-Control-Allow-Headers', implode(', ', $allowedHeaders));
            }
        }

        return $response;
    }

    private function resolveAllowOrigin(string $origin, array $allowedOrigins): ?string
    {
        if ($origin === '') {
            return null;
        }
        if (in_array('*', $allowedOrigins, true)) {
            return '*';
        }
        if (in_array($origin, $allowedOrigins, true)) {
            return $origin;
        }
        return null;
    }
}
