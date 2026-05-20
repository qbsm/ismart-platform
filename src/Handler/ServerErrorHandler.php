<?php

declare(strict_types=1);

namespace App\Handler;

use App\Middleware\CorrelationIdMiddleware;
use App\Support\BaseUrlResolver;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Slim\Views\Twig;
use Throwable;

/**
 * Единый обработчик необработанных исключений:
 * - для Accept: application/json — структурированный JSON (без деталей в production);
 * - для браузера — брендированная страница 500.twig.
 * В production детали исключения не отдаются клиенту (маскирование), логируются на сервере.
 */
final class ServerErrorHandler
{
    public function __construct(
        private ResponseFactoryInterface $responseFactory,
        private Twig $twig,
        private BaseUrlResolver $baseUrlResolver,
        private LoggerInterface $logger,
        private bool $displayErrorDetails,
    ) {
    }

    public function __invoke(
        ServerRequestInterface $request,
        Throwable $exception,
        bool $displayErrorDetails,
        bool $logErrors,
        bool $logErrorDetails
    ): ResponseInterface {
        $requestId = $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');

        if ($logErrors) {
            $context = ['request_id' => $requestId];
            if ($logErrorDetails) {
                $context['exception'] = $exception;
            }
            $this->logger->error($exception->getMessage(), $context);
        }

        $response = $this->responseFactory->createResponse(500);
        $response = $this->withRequestIdHeader($response, $requestId);

        $wantsJson = $this->wantsJson($request);
        if ($wantsJson) {
            $payload = [
                'error' => 'Internal Server Error',
                'request_id' => $requestId,
            ];
            if ($this->displayErrorDetails && $displayErrorDetails) {
                $payload['message'] = $exception->getMessage();
            }
            $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        }

        $baseUrl = $this->baseUrlResolver->resolve($request);
        if ($baseUrl !== '' && !str_ends_with($baseUrl, '/')) {
            $baseUrl .= '/';
        }
        $response->getBody()->write(
            $this->twig->getEnvironment()->render('errors/500.twig', ['base_url' => $baseUrl])
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

    private function withRequestIdHeader(ResponseInterface $response, string $requestId): ResponseInterface
    {
        if ($requestId !== '') {
            return $response->withHeader('X-Request-Id', $requestId);
        }
        return $response;
    }
}
