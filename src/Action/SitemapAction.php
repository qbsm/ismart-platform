<?php

declare(strict_types=1);

namespace App\Action;

use App\Support\CitySlugger;
use App\Support\Json;
use App\Support\PlatformSettings;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Генерация sitemap.xml с учётом мультиязычности и hreflang.
 * Список страниц берётся из config: settings['sitemap_pages'] (массив page_id).
 */
final class SitemapAction
{
    /** @var array<string, mixed> */
    private array $settings;

    /** @param array<string, mixed> $settings */
    public function __construct(array $settings)
    {
        $this->settings = $settings;
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $uri = $request->getUri();
        $base = $uri->getScheme() . '://' . $uri->getHost();
        $path = $uri->getPath();
        if ($path !== '' && $path !== '/') {
            $base .= rtrim(dirname($path), '/');
        }
        $base = rtrim($base, '/');

        $langs = PlatformSettings::availableLangs($this->settings);
        $defaultLang = PlatformSettings::defaultLang($this->settings);
        $routeMap = PlatformSettings::routeMap($this->settings);

        $sitemapPages = (array) ($this->settings['sitemap_pages'] ?? []);
        $urls = $this->buildUrls($base, $langs, $defaultLang, $routeMap, $sitemapPages);

        $dynamicPages = (array) ($this->settings['sitemap_dynamic_pages'] ?? []);
        $jsonBaseDir = (string) ($this->settings['paths']['json_base'] ?? '');
        if ($dynamicPages !== [] && $jsonBaseDir !== '') {
            $urls = array_merge(
                $urls,
                $this->buildDynamicUrls($base, $langs, $defaultLang, $routeMap, $dynamicPages, $jsonBaseDir)
            );
        }

        $xml = $this->renderSitemap($base, $urls);

        $response->getBody()->write($xml);

        return $response
            ->withHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->withStatus(200);
    }

    /**
     * @param array<int, string> $langs
     * @param array<string, string> $routeMap slug => page_id
     * @param array<int, string> $sitemapPages page_id для включения в sitemap
     * @return array<int, array{loc: string, alternates: array<string, string>}>
     */
    private function buildUrls(string $base, array $langs, string $defaultLang, array $routeMap, array $sitemapPages): array
    {
        $reverseMap = array_flip($routeMap);
        $urls = [];

        foreach ($sitemapPages as $pageId) {
            $pathSegment = $this->pageIdToPathSegment($pageId, $reverseMap);

            foreach ($langs as $lang) {
                $loc = $this->buildLangPath($base, $lang, $defaultLang, $pathSegment);
                $alternates = [];
                foreach ($langs as $altLang) {
                    $alternates[$altLang] = $this->buildLangPath($base, $altLang, $defaultLang, $pathSegment);
                }
                $urls[] = ['loc' => $loc, 'alternates' => $alternates];
            }
        }

        return $urls;
    }

    private function pageIdToPathSegment(string $pageId, array $reverseMap): string
    {
        if ($pageId === 'index') {
            return '';
        }
        return (string) ($reverseMap[$pageId] ?? $pageId);
    }

    /**
     * Раскрывает динамические подпути (например, /buy/<city>/) для каждого языка.
     *
     * @param array<int, string> $langs
     * @param array<string, string> $routeMap
     * @param array<string, array<string, mixed>> $dynamicPages
     * @return array<int, array{loc: string, alternates: array<string, string>}>
     */
    private function buildDynamicUrls(
        string $base,
        array $langs,
        string $defaultLang,
        array $routeMap,
        array $dynamicPages,
        string $jsonBaseDir
    ): array {
        $reverseMap = array_flip($routeMap);
        $urls = [];

        foreach ($dynamicPages as $pageId => $config) {
            $pathSegment = $this->pageIdToPathSegment((string) $pageId, $reverseMap);
            $dataPage = (string) ($config['data_page'] ?? '');
            $listKey = (string) ($config['list_key'] ?? '');
            $valueKey = (string) ($config['value_key'] ?? '');
            $sluggerKey = (string) ($config['slugger'] ?? 'city');
            if ($pathSegment === '' || $dataPage === '' || $listKey === '' || $valueKey === '') {
                continue;
            }

            // Slug-набор одинаковый для всех языков: данные дилеров — это адреса/названия
            // на родном языке, перевод не предполагается. Берём slug-набор из дефолтного языка.
            $slugs = $this->loadDynamicSlugs($jsonBaseDir, $defaultLang, $dataPage, $listKey, $valueKey, $sluggerKey);
            if ($slugs === []) {
                continue;
            }

            foreach ($slugs as $subSlug) {
                foreach ($langs as $lang) {
                    $loc = $this->buildLangPath($base, $lang, $defaultLang, $pathSegment . '/' . $subSlug);
                    $alternates = [];
                    foreach ($langs as $altLang) {
                        $alternates[$altLang] = $this->buildLangPath($base, $altLang, $defaultLang, $pathSegment . '/' . $subSlug);
                    }
                    $urls[] = ['loc' => $loc, 'alternates' => $alternates];
                }
            }
        }

        return $urls;
    }

    private function buildLangPath(string $base, string $lang, string $defaultLang, string $pathSegment): string
    {
        if ($pathSegment === '') {
            return $base . ($lang === $defaultLang ? '/' : '/' . $lang);
        }
        $prefix = $lang === $defaultLang ? '' : '/' . $lang;
        return $base . $prefix . '/' . $pathSegment;
    }

    /**
     * @return array<int, string>
     */
    private function loadDynamicSlugs(
        string $jsonBaseDir,
        string $lang,
        string $dataPage,
        string $listKey,
        string $valueKey,
        string $sluggerKey
    ): array {
        $items = Json::loadKey($jsonBaseDir . '/' . $lang . '/pages/' . $dataPage . '.json', $listKey);
        if ($items === null) {
            return [];
        }

        $slugs = [];
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item[$valueKey]) || !is_string($item[$valueKey])) {
                continue;
            }
            $slug = $this->slugifyValue((string) $item[$valueKey], $sluggerKey);
            if ($slug === '' || in_array($slug, $slugs, true)) {
                continue;
            }
            $slugs[] = $slug;
        }
        sort($slugs);
        return $slugs;
    }

    private function slugifyValue(string $value, string $sluggerKey): string
    {
        return match ($sluggerKey) {
            'city' => CitySlugger::slug($value),
            default => CitySlugger::slug($value),
        };
    }

    /**
     * @param array<int, array{loc: string, alternates: array<string, string>}> $urls
     */
    private function renderSitemap(string $base, array $urls): string
    {
        $out = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $out .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' . "\n";

        foreach ($urls as $u) {
            $out .= '  <url>' . "\n";
            $out .= '    <loc>' . htmlspecialchars($u['loc'], ENT_XML1, 'UTF-8') . '</loc>' . "\n";
            foreach ($u['alternates'] as $hreflang => $href) {
                $out .= '    <xhtml:link rel="alternate" hreflang="' . htmlspecialchars($hreflang, ENT_XML1, 'UTF-8') . '" href="' . htmlspecialchars($href, ENT_XML1, 'UTF-8') . '"/>' . "\n";
            }
            $out .= '  </url>' . "\n";
        }

        $out .= '</urlset>';
        return $out;
    }
}
