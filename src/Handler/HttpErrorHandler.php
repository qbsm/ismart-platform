<?php

declare(strict_types=1);

namespace App\Handler;

use App\Middleware\CorrelationIdMiddleware;
use App\Support\BaseUrlResolver;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Exception\HttpException;
use Slim\Views\Twig;
use Throwable;

/**
 * Обработчик HTTP-ошибок (404, 405 и др.): отдаёт ответ по карте доменных ошибок.
 * HTML (errors/{code}.twig) или JSON при Accept: application/json.
 */
final class HttpErrorHandler
{
    private const FALLBACK_CODE = 500;

    public function __construct(
        private ResponseFactoryInterface $responseFactory,
        private Twig $twig,
        private BaseUrlResolver $baseUrlResolver,
        private array $errorMap,
    ) {
    }

    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails
    ): ResponseInterface {
        $code = $exception instanceof HttpException ? $exception->getCode() : self::FALLBACK_CODE;
        $entry = $this->errorMap[$code] ?? $this->errorMap[self::FALLBACK_CODE];
        $title = $entry['title'] ?? 'Ошибка';
        $message = $entry['message'] ?? '';

        $requestId = $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');
        $response = $this->responseFactory->createResponse($code);
        if ($requestId !== '') {
            $response = $response->withHeader('X-Request-Id', $requestId);
        }

        if ($this->wantsJson($request)) {
            $payload = [
                'error' => $title,
                'message' => $message,
                'request_id' => $requestId,
            ];
            $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $baseUrl = $this->baseUrlResolver->resolve($request);
        if ($baseUrl !== '' && !str_ends_with($baseUrl, '/')) {
            $baseUrl .= '/';
        }

        $response->getBody()->write(
            $this->twig->getEnvironment()->render('errors/http.twig', [
                'base_url' => $baseUrl,
                'title' => $title,
                'message' => $message,
                'code' => $code,
            ])
        );
        return $response->withHeader('Content-Type', 'text/html; charset=utf-8');
    }

    private function wantsJson(ServerRequestInterface $request): bool
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
}
