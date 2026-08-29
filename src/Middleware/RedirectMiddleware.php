<?php

namespace App\Middleware;

use App\Support\BaseUrlResolver;
use App\Support\Json;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class RedirectMiddleware implements MiddlewareInterface
{
    /** @var array<string,mixed> */
    private array $settings;
    /** @var array<int,array{from?:string,to?:string,from_prefix?:string,to_prefix?:string,status?:int}>|null */
    private ?array $map = null;

    /**
     * @param array<string,mixed> $settings
     */
    public function __construct(
        array $settings,
        private ResponseFactoryInterface $responseFactory,
        private BaseUrlResolver $baseUrlResolver
    ) {
        $this->settings = $settings;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = rtrim($request->getUri()->getPath(), '/');
        $path = $path === '' ? '/' : $path;

        $redirect = $this->getRedirectTarget($path, $this->baseUrlResolver->resolve($request));
        if ($redirect !== null) {
            $response = $this->responseFactory->createResponse($redirect['status']);
            return $response->withHeader('Location', $redirect['to']);
        }

        return $handler->handle($request);
    }

    /**
     * @return array{to:string,status:int}|null
     */
    private function getRedirectTarget(string $requestPath, string $baseUrl): ?array
    {
        foreach ($this->loadMap() as $rule) {
            $status = (int) ($rule['status'] ?? 301);

            // Префиксное правило переносит на новый раздел весь хвост пути: устаревшую
            // структуру адресов не приходится перечислять по одному URL.
            if (isset($rule['from_prefix'], $rule['to_prefix'])) {
                $prefix = rtrim((string) $rule['from_prefix'], '/');
                if ($prefix === '' || ($requestPath !== $prefix && !str_starts_with($requestPath, $prefix . '/'))) {
                    continue;
                }
                $to = rtrim((string) $rule['to_prefix'], '/') . substr($requestPath, strlen($prefix));
            } elseif (isset($rule['from'], $rule['to'])) {
                $from = rtrim((string) $rule['from'], '/');
                $from = $from === '' ? '/' : $from;
                if ($from !== $requestPath) {
                    continue;
                }
                $to = (string) $rule['to'];
            } else {
                continue;
            }

            if (str_starts_with($to, 'http://') || str_starts_with($to, 'https://')) {
                return ['to' => $to, 'status' => $status];
            }

            return ['to' => rtrim($baseUrl, '/') . '/' . ltrim($to, '/'), 'status' => $status];
        }

        return null;
    }

    /**
     * @return array<int,array{from?:string,to?:string,from_prefix?:string,to_prefix?:string,status?:int}>
     */
    private function loadMap(): array
    {
        if ($this->map !== null) {
            return $this->map;
        }

        $path = (string) ($this->settings['paths']['redirects'] ?? '');
        $this->map = $path === '' ? [] : (Json::load($path) ?? []);
        return $this->map;
    }
}
