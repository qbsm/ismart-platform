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

        $baseUrl = $this->baseUrlResolver->resolve($request);

        // Карта правил идёт первой: иначе /JOLI сперва уехал бы на /joli и только потом
        // на карточку — лишний переход в цепочке.
        $redirect = $this->getRedirectTarget($path, $baseUrl);
        if ($redirect !== null) {
            $response = $this->responseFactory->createResponse($redirect['status']);
            return $response->withHeader('Location', $redirect['to']);
        }

        // Слаги на сайте всегда в нижнем регистре. Адрес, набранный капсом (/Restaurants/JOLI),
        // ведёт на ту же страницу — отдаём её каноническим адресом, а не 404.
        $lower = mb_strtolower($path);
        if ($lower !== $path) {
            $response = $this->responseFactory->createResponse(301);
            $query = $request->getUri()->getQuery();
            $target = rtrim($baseUrl, '/') . $lower;

            return $response->withHeader('Location', $query === '' ? $target : $target . '?' . $query);
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
            // Регистр в правилах не учитываем: старые ссылки и набранные руками адреса
            // часто приходят как /JOLI или /Bist, а отдавать по ним 404 незачем.
            $requestLower = mb_strtolower($requestPath);

            if (isset($rule['from_prefix'], $rule['to_prefix'])) {
                $prefix = mb_strtolower(rtrim((string) $rule['from_prefix'], '/'));
                if ($prefix === '' || ($requestLower !== $prefix && !str_starts_with($requestLower, $prefix . '/'))) {
                    continue;
                }
                $to = rtrim((string) $rule['to_prefix'], '/') . substr($requestPath, strlen($prefix));
            } elseif (isset($rule['from'], $rule['to'])) {
                $from = mb_strtolower(rtrim((string) $rule['from'], '/'));
                $from = $from === '' ? '/' : $from;
                if ($from !== $requestLower) {
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
