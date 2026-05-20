<?php

declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Добавляет HTTP security headers ко всем ответам, включая базовую Content-Security-Policy.
 */
final class SecurityHeadersMiddleware implements MiddlewareInterface
{
    /** Базовая CSP: default self, скрипты/стили с self + unsafe-inline, картинки self/data/https, шрифты self */
    private const DEFAULT_CSP = "default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; base-uri 'self'; form-action 'self' https:; frame-ancestors 'self'";

    public function __construct(
        private readonly bool $addHsts = true,
        private readonly ?string $contentSecurityPolicy = self::DEFAULT_CSP,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);

        $response = $response
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('X-Frame-Options', 'SAMEORIGIN')
            ->withHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->withHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        if ($this->addHsts) {
            $response = $response->withHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        if ($this->contentSecurityPolicy !== null && $this->contentSecurityPolicy !== '') {
            $response = $response->withHeader('Content-Security-Policy', $this->contentSecurityPolicy);
        }

        $host = $request->getUri()->getHost();
        if (str_ends_with($host, '.ismart.pro') || ($_ENV['APP_ENV'] ?? '') === 'staging') {
            $response = $response->withHeader('X-Robots-Tag', 'noindex, nofollow');
        }

        return $response;
    }
}
