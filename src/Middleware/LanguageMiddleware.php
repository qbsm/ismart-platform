<?php

namespace App\Middleware;

use App\Service\DataLoaderService;
use App\Service\LanguageService;
use App\Support\BaseUrlResolver;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class LanguageMiddleware implements MiddlewareInterface
{
    /** @var array<string,mixed> */
    private array $settings;

    /**
     * @param array<string,mixed> $settings
     */
    public function __construct(
        array $settings,
        private DataLoaderService $dataLoader,
        private LanguageService $languageService,
        private BaseUrlResolver $baseUrlResolver
    ) {
        $this->settings = $settings;
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $path = trim($request->getUri()->getPath(), '/');
        $segments = $path === '' ? [] : array_values(array_filter(explode('/', $path), static fn (string $v) => $v !== ''));

        $baseUrl = $this->baseUrlResolver->resolve($request);
        $globalPath = (string) ($this->settings['paths']['json_global'] ?? '');
        $global = $this->dataLoader->loadGlobal($globalPath, $baseUrl);

        $supportedLanguages = [];
        if (isset($global['lang']) && is_array($global['lang'])) {
            foreach ($global['lang'] as $langInfo) {
                if (!is_array($langInfo) || !isset($langInfo['code'])) {
                    continue;
                }
                $supportedLanguages[(string) $langInfo['code']] = $langInfo;
            }
        }

        if ($supportedLanguages === []) {
            $default = (string) ($this->settings['default_lang'] ?? 'ru');
            $supportedLanguages[$default] = ['code' => $default];
        }

        $detected = $this->languageService->detect(
            $segments,
            $supportedLanguages,
            (string) ($this->settings['default_lang'] ?? 'ru')
        );

        $request = $request
            ->withAttribute('base_url', $baseUrl)
            ->withAttribute('global', $global)
            ->withAttribute('lang_code', $detected['lang_code'])
            ->withAttribute('current_lang', $detected['current_lang'])
            ->withAttribute('is_lang_in_url', $detected['is_lang_in_url'])
            ->withAttribute('segments', $detected['segments']);

        return $handler->handle($request);
    }
}
