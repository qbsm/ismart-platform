<?php

declare(strict_types=1);

namespace App\Action;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Health check для мониторинга (load balancer, uptime, алерты).
 * GET /health → 200 + JSON { "status": "ok" }.
 */
final class HealthAction
{
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = (string) json_encode(['status' => 'ok'], JSON_UNESCAPED_UNICODE);
        $response->getBody()->write($body);
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(200);
    }
}
