<?php

declare(strict_types=1);

namespace App\Support;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Trait для Handler'ов и Action'ов: разбор Accept-заголовка и проставление X-Request-Id.
 * Убирает дублирование между HttpErrorHandler и ServerErrorHandler.
 */
trait RespondsToContent
{
    protected function wantsJson(ServerRequestInterface $request): bool
    {
        $accept = $request->getHeaderLine('Accept');
        if ($accept === '') {
            return false;
        }
        foreach (array_map('trim', explode(',', $accept)) as $part) {
            $type = strtolower(explode(';', $part)[0]);
            if ($type === 'application/json') {
                return true;
            }
        }
        return false;
    }

    protected function withRequestIdHeader(ResponseInterface $response, string $requestId): ResponseInterface
    {
        return $requestId !== '' ? $response->withHeader('X-Request-Id', $requestId) : $response;
    }
}
