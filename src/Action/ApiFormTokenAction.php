<?php

declare(strict_types=1);

namespace App\Action;

use App\Support\FormToken;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Выдаёт токен формы браузеру. Запрашивается при первом касании поля, поэтому робот,
 * скачавший страницу, отправить заявку не может — в HTML токена нет.
 */
final class ApiFormTokenAction
{
    public function __construct(private readonly FormToken $formToken) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $payload = [
            'token' => $this->formToken->issue(),
            'min_age' => $this->formToken->minAge(),
        ];

        $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Cache-Control', 'no-store');
    }
}
