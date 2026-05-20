<?php

namespace App\Action;

use App\Event\EntityResolved;
use App\Event\PageLoaded;
use App\Event\SeoBuilt;
use App\Service\DataLoaderService;
use App\Service\SeoBuilderRegistry;
use App\Service\SeoService;
use App\Service\TemplateDataBuilder;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Views\Twig;
use Twig\Environment;

final class PageAction
{
    /** @var array<string,mixed> */
    private array $settings;

    /**
     * @param array<string,mixed> $settings
     */
    public function __construct(
        Twig $twig,
        DataLoaderService $dataLoader,
        SeoService $seoService,
        TemplateDataBuilder $templateDataBuilder,
        array $settings,
        ?EventDispatcherInterface $dispatcher = null,
        ?SeoBuilderRegistry $seoBuilderRegistry = null,
    ) {
        $this->twig = $twig;
        $this->dataLoader = $dataLoader;
        $this->seoService = $seoService;
        $this->templateDataBuilder = $templateDataBuilder;
        $this->settings = $settings;
        $this->dispatcher = $dispatcher;
        $this->seoBuilderRegistry = $seoBuilderRegistry;
    }

    private Twig $twig;
    private DataLoaderService $dataLoader;
    private SeoService $seoService;
    private TemplateDataBuilder $templateDataBuilder;
    private ?EventDispatcherInterface $dispatcher;
    private ?SeoBuilderRegistry $seoBuilderRegistry;

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $csrfToken = $this->ensureCsrfToken();
        $segments = $request->getAttribute('segments', []);
        $baseUrl = (string) $request->getAttribute('base_url', '/');
        $global = $request->getAttribute('global', []);
        $langCode = (string) $request->getAttribute('lang_code', $this->settings['default_lang'] ?? 'ru');
        $currentLang = $request->getAttribute('current_lang', ['code' => $langCode]);
        $isLangInUrl = (bool) $request->getAttribute('is_lang_in_url', false);

        $pageId = 'index';
        $routeParams = [];
        if (!empty($segments)) {
            $slug = (string) $segments[0];
            $routeMap = (array) ($this->settings['route_map'] ?? []);
            $pageId = (string) ($routeMap[$slug] ?? $slug);
            $routeParams = array_slice($segments, 1);
        }

        $pageDirTemplate = (string) ($this->settings['paths']['json_pages_dir'] ?? '');
        $pageJsonDir = str_replace('{lang}', $langCode, $pageDirTemplate);
        $pageData = $this->dataLoader->loadPage($pageJsonDir, $pageId, $baseUrl);

        $collections = (array) ($this->settings['collections'] ?? []);
        $jsonBaseDir = (string) ($this->settings['paths']['json_base'] ?? '');

        $status = 200;
        $entity = null;
        $entityType = '';
        $entityConfig = [];

        if ($pageData === null) {
            $slug = (string) ($segments[0] ?? '');
            if ($slug !== '') {
                foreach ($collections as $collKey => $collConfig) {
                    $collConfig = (array) $collConfig;
                    $slugs = $this->dataLoader->loadEntitySlugs($jsonBaseDir, $langCode, $collConfig);
                    if ($slugs !== null && in_array($slug, $slugs, true)) {
                        $loaded = $this->dataLoader->loadEntity($jsonBaseDir, $langCode, $slug, $baseUrl, $collConfig);
                        if ($loaded !== null) {
                            $entity = $loaded;
                            $entityType = (string) $collKey;
                            $entityConfig = $collConfig;
                            break;
                        }
                    }
                }
            }

            if ($entity !== null) {
                $pageId = $slug;
                $routeParams = [];
                $pageData = ['name' => $slug, 'sections' => []];
                $this->dispatch(new EntityResolved($entityType, $slug, $entity, $entityConfig));
            } else {
                $status = 404;
                $pageId = '404';
                $pageData = $this->dataLoader->loadPage($pageJsonDir, '404', $baseUrl) ?? ['name' => '404', 'sections' => []];
            }
        }

        if ($entity === null) {
            foreach ($collections as $collKey => $collConfig) {
                $collConfig = (array) $collConfig;
                $listPageId = (string) ($collConfig['list_page_id'] ?? '');
                if ($pageId !== $listPageId) {
                    continue;
                }

                if (count($routeParams) === 0) {
                    $this->injectListItems($pageData, $jsonBaseDir, $langCode, $baseUrl, $collConfig);
                } elseif (count($routeParams) === 1) {
                    $subSlug = (string) $routeParams[0];
                    $slugs = $this->dataLoader->loadEntitySlugs($jsonBaseDir, $langCode, $collConfig);
                    if ($slugs !== null && in_array($subSlug, $slugs, true)) {
                        $loaded = $this->dataLoader->loadEntity($jsonBaseDir, $langCode, $subSlug, $baseUrl, $collConfig);
                        if ($loaded !== null) {
                            $entity = $loaded;
                            $entityType = (string) $collKey;
                            $entityConfig = $collConfig;
                            $pageData = ['name' => $subSlug, 'sections' => []];
                            $this->dispatch(new EntityResolved($entityType, $subSlug, $entity, $entityConfig));
                        }
                    }
                    if ($entity === null) {
                        $status = 404;
                        $pageId = '404';
                        $pageData = $this->dataLoader->loadPage($pageJsonDir, '404', $baseUrl) ?? ['name' => '404', 'sections' => []];
                    }
                } else {
                    $status = 404;
                    $pageId = '404';
                    $pageData = $this->dataLoader->loadPage($pageJsonDir, '404', $baseUrl) ?? ['name' => '404', 'sections' => []];
                }
                break;
            }
        }

        $this->dispatch(new PageLoaded($pageId, $langCode, $pageData, $status));

        $seoData = $this->dataLoader->loadSeo($jsonBaseDir, $langCode, $pageId, $baseUrl);

        if ($entity !== null) {
            $seoData = $this->buildSeoForEntity($entity, $baseUrl, $langCode, $entityConfig, is_array($global) ? $global : [], $entityType);
        }

        if ($seoData !== null) {
            $twigEnv = $this->twig->getEnvironment();
            $seoData = $this->seoService->processTemplates($seoData, [
                'pageData' => $pageData,
                'global' => $global,
                'settings' => $this->settings,
                'currentLang' => $currentLang,
                'lang_code' => $langCode,
                'route_params' => $routeParams,
                'base_url' => $baseUrl,
                'is_lang_in_url' => $isLangInUrl,
            ], $twigEnv);
        } else {
            $seoData = ['title' => '', 'meta' => [], 'json_ld' => null];
        }

        $this->dispatch(new SeoBuilt($pageId, $seoData, $entity !== null));

        $template = 'pages/page.twig';
        $extras = [];
        if ($entity !== null) {
            $template = (string) ($entityConfig['template'] ?? 'pages/page.twig');
            $extrasKey = (string) ($entityConfig['extras_key'] ?? $entityType);
            $extras[$extrasKey] = $entity;
            $extras['entity'] = $entity;
            $extras['breadcrumb'] = $this->buildEntityBreadcrumb($global, $langCode, $entity, $entityConfig);
            $extras['frame_data'] = $this->extractFrameFromListPage($pageJsonDir, $entityConfig, $baseUrl);
            $extras['seo_url_path'] = trim((string) ($entityConfig['nav_slug'] ?? ''), '/') . '/' . trim((string) ($entity['slug'] ?? ''), '/');
        }

        $data = $this->templateDataBuilder->build(
            $this->settings,
            is_array($global) ? $global : [],
            $pageData,
            $seoData,
            [
                'current_lang' => is_array($currentLang) ? $currentLang : ['code' => $langCode],
                'lang_code' => $langCode,
                'page_id' => $pageId,
                'route_params' => $routeParams,
                'base_url' => $baseUrl,
                'is_lang_in_url' => $isLangInUrl,
                'csrf_token' => $csrfToken,
            ],
            $extras
        );

        return $this->twig->render($response->withStatus($status), $template, $data);
    }

    /**
     * @param array<string,mixed> $entity
     * @param array<string,mixed> $config
     * @return array<string,mixed>
     */
    /**
     * Строит SEO для entity-страницы коллекции.
     *
     * Если SeoBuilderRegistry зарегистрирован и содержит builder для коллекции (или default) — делегирует ему.
     * Иначе — inline generic-логика (для обратной совместимости deployments без Registry).
     *
     * @param array<string,mixed> $entity
     * @param array<string,mixed> $config
     * @param array<string,mixed> $global
     * @return array<string,mixed>
     */
    private function buildSeoForEntity(array $entity, string $baseUrl, string $langCode, array $config, array $global, string $entityType): array
    {
        if ($this->seoBuilderRegistry !== null) {
            $builder = $this->seoBuilderRegistry->get($entityType);
            if ($builder !== null) {
                return $builder->build($entity, $baseUrl, $langCode, $config, $global);
            }
        }

        // Inline fallback (legacy-совместимость): generic SEO без специфического Schema.org.
        $itemKey = (string) ($config['item_key'] ?? '');
        $ogType = (string) ($config['og_type'] ?? 'website');
        $siteName = (string) ($global['name'] ?? $global['site_name'] ?? '');

        $inner = $itemKey !== '' ? ($entity[$itemKey] ?? []) : $entity;
        $name = (string) ($inner['name'] ?? $inner['title'] ?? $entity['slug'] ?? '');
        $desc = (string) ($entity['desc']['short'] ?? $entity['desc']['full'] ?? $inner['desc'] ?? $inner['lead'] ?? '');
        $ogImage = rtrim($baseUrl, '/') . '/data/img/seo/og.webp?v=2';

        $meta = [
            ['name' => 'description', 'content' => $desc],
            ['property' => 'og:type', 'content' => $ogType],
            ['property' => 'og:title', 'content' => $name],
            ['property' => 'og:description', 'content' => $desc],
            ['property' => 'og:image', 'content' => $ogImage],
        ];
        if ($siteName !== '') {
            $meta[] = ['property' => 'og:site_name', 'content' => $siteName];
        }

        return [
            'title' => $name,
            'meta' => $meta,
            'json_ld' => null,
            'json_ld_faq' => null,
        ];
    }

    /**
     * @param array<string,mixed> $global
     * @param array<string,mixed> $entity
     * @param array<string,mixed> $config
     * @return array<int, array{name: string, url: string}>
     */
    private function buildEntityBreadcrumb(array $global, string $langCode, array $entity, array $config): array
    {
        $navSlug = (string) ($config['nav_slug'] ?? '');
        $itemKey = (string) ($config['item_key'] ?? '');

        $inner = $itemKey !== '' ? ($entity[$itemKey] ?? []) : $entity;
        $name = (string) ($inner['name'] ?? $inner['title'] ?? $entity['slug'] ?? '');
        $slug = (string) ($entity['slug'] ?? '');

        $nav = $global['nav'][$langCode]['items'] ?? [];
        $homeTitle = 'Главная';
        $listTitle = ucfirst($navSlug);
        $listHref = '/' . $navSlug . '/';
        foreach ($nav as $navItem) {
            if (!is_array($navItem)) {
                continue;
            }
            $href = trim((string) ($navItem['href'] ?? ''), '/');
            if ($href === '' || $href === '/') {
                $homeTitle = (string) ($navItem['title'] ?? $homeTitle);
            }
            if ($href === $navSlug) {
                $listTitle = (string) ($navItem['title'] ?? $listTitle);
                $listHref = '/' . $href . '/';
            }
        }

        return [
            ['name' => $homeTitle, 'url' => '/'],
            ['name' => $listTitle, 'url' => $listHref],
            ['name' => $name, 'url' => '/' . $slug . '/'],
        ];
    }

    /**
     * @param array<string,mixed> $pageData
     * @param array<string,mixed> $config
     */
    private function injectListItems(array &$pageData, string $jsonBaseDir, string $langCode, string $baseUrl, array $config): void
    {
        $navSlug = (string) ($config['nav_slug'] ?? '');
        $itemKey = (string) ($config['item_key'] ?? '');

        $slugs = [];
        $topLevelItems = $pageData['items'] ?? [];
        if (is_array($topLevelItems) && $topLevelItems !== []) {
            foreach ($topLevelItems as $item) {
                if (is_string($item) && $item !== '') {
                    $slugs[] = $item;
                } elseif (is_array($item) && isset($item['slug']) && is_string($item['slug']) && $item['slug'] !== '') {
                    $slugs[] = $item['slug'];
                }
            }
        }

        $sections = &$pageData['sections'];
        if (!is_array($sections)) {
            return;
        }

        if ($slugs === []) {
            foreach ($sections as $section) {
                if (
                    !is_array($section)
                    || ($section['name'] ?? '') !== $navSlug
                    || !isset($section['data']['items'])
                    || !is_array($section['data']['items'])
                ) {
                    continue;
                }
                foreach ($section['data']['items'] as $item) {
                    if (is_string($item) && $item !== '') {
                        $slugs[] = $item;
                    } elseif (is_array($item) && isset($item['slug']) && is_string($item['slug']) && $item['slug'] !== '') {
                        $slugs[] = $item['slug'];
                    }
                }
                break;
            }
        }

        $slugs = array_values(array_unique($slugs));
        if ($slugs === []) {
            return;
        }

        $items = [];
        foreach ($slugs as $entitySlug) {
            $entity = $this->dataLoader->loadEntity($jsonBaseDir, $langCode, (string) $entitySlug, $baseUrl, $config);
            if ($entity === null) {
                continue;
            }
            $inner = $itemKey !== '' ? ($entity[$itemKey] ?? []) : $entity;
            $items[] = [
                'slug' => $entity['slug'] ?? $entitySlug,
                'cover' => $inner['cover'] ?? ['src' => ''],
                'hex' => $inner['hex'] ?? '',
                'date' => $inner['date'] ?? '',
                'title' => $inner['title'] ?? $inner['name'] ?? '',
                'desc' => $inner['desc'] ?? $inner['lead'] ?? '',
            ];
        }

        foreach ($sections as $idx => $section) {
            if (isset($section['name']) && $section['name'] === $navSlug && isset($section['data'])) {
                $sections[$idx]['data']['items'] = $items;
                return;
            }
        }
    }

    /**
     * @param array<string,mixed> $config
     * @return array<string,mixed>|null
     */
    private function extractFrameFromListPage(string $pageJsonDir, array $config, string $baseUrl): ?array
    {
        $listPageId = (string) ($config['list_page_id'] ?? '');
        if ($listPageId === '') {
            return null;
        }

        $listPage = $this->dataLoader->loadPage($pageJsonDir, $listPageId, $baseUrl);
        if ($listPage === null || !isset($listPage['sections']) || !is_array($listPage['sections'])) {
            return null;
        }

        foreach ($listPage['sections'] as $section) {
            if (is_array($section) && ($section['name'] ?? '') === 'frame' && isset($section['data'])) {
                return (array) $section['data'];
            }
        }

        return null;
    }

    private function dispatch(object $event): void
    {
        $this->dispatcher?->dispatch($event);
    }

    private function ensureCsrfToken(): string
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || $_SESSION['csrf_token'] === '') {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];
    }
}
