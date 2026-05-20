<?php

namespace App\Middleware;

use App\Support\BaseUrlResolver;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class RedirectMiddleware implements MiddlewareInterface
{
    /** @var array<string,mixed> */
    private array $settings;
    /** @var array<int,array{from?:string,to?:string,status?:int}>|null */
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
            if (!isset($rule['from'], $rule['to'])) {
                continue;
            }

            $from = rtrim((string) $rule['from'], '/');
            $from = $from === '' ? '/' : $from;
            if ($from !== $requestPath) {
                continue;
            }

            $to = (string) $rule['to'];
            $status = (int) ($rule['status'] ?? 301);
            if (str_starts_with($to, 'http://') || str_starts_with($to, 'https://')) {
                return ['to' => $to, 'status' => $status];
            }

            return ['to' => rtrim($baseUrl, '/') . '/' . ltrim($to, '/'), 'status' => $status];
        }

        return null;
    }

    /**
     * @return array<int,array{from?:string,to?:string,status?:int}>
     */
    private function loadMap(): array
    {
        if ($this->map !== null) {
            return $this->map;
        }

        $path = (string) ($this->settings['paths']['redirects'] ?? '');
        if ($path === '' || !is_file($path)) {
            $this->map = [];
            return $this->map;
        }

        $content = @file_get_contents($path);
        if ($content === false) {
            $this->map = [];
            return $this->map;
        }

        $data = json_decode($content, true);
        $this->map = is_array($data) ? $data : [];
        return $this->map;
    }
}
