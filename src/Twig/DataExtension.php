<?php

namespace App\Twig;

use App\Support\CitySlugger;
use App\Support\Json;
use App\Support\JsonProcessor;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

class DataExtension extends AbstractExtension
{
    private string $baseDir;
    private string $baseUrl;
    /** @var array<string, array<string,mixed>|null> */
    private array $cache = [];
    /** @var array<string, array{width: int, height: int}>|null */
    private ?array $imageDimensionsManifest = null;

    public function __construct(string $baseDir, string $baseUrl)
    {
        $this->baseDir = rtrim($baseDir, '/');
        $this->baseUrl = rtrim($baseUrl, '/') . '/';
    }

    public function getFunctions(): array
    {
        return [
            new TwigFunction('load_json', [$this, 'loadJson']),
            new TwigFunction('image_dimensions', [$this, 'getImageDimensions']),
            new TwigFunction('city_to_slug', [CitySlugger::class, 'slug']),
            new TwigFunction('resolve_city_by_slug', [$this, 'resolveCityBySlug']),
            new TwigFunction('resolve_section_meta', [$this, 'resolveSectionMeta']),
        ];
    }

    /**
     * Возвращает SEO-строку для динамической страницы вида /<page>/<city-slug>.
     *
     * Источник правды — секция в pages/{lang}/{pageId}.json:
     *   data.meta_{key}_base          — текст без города
     *   data.meta_{key}_city_template — шаблон с {city}
     *
     * Если route_params[0] резолвится в известный город, возвращает шаблон
     * с подставленным предложным падежом; иначе — base.
     *
     * @param array<int,string> $routeParams
     */
    public function resolveSectionMeta(
        string $pageId,
        string $sectionName,
        string $key,
        string $langCode,
        array $routeParams = []
    ): string {
        $page = $this->loadJson("data/json/{$langCode}/pages/{$pageId}.json");
        if (!is_array($page) || !isset($page['sections']) || !is_array($page['sections'])) {
            return '';
        }

        $base = '';
        $template = '';
        foreach ($page['sections'] as $section) {
            if (!is_array($section) || ($section['name'] ?? null) !== $sectionName) {
                continue;
            }
            $data = is_array($section['data'] ?? null) ? $section['data'] : [];
            $base = (string) ($data["meta_{$key}_base"] ?? '');
            $template = (string) ($data["meta_{$key}_city_template"] ?? '');
            break;
        }

        $slug = (string) ($routeParams[0] ?? '');
        $city = $this->resolveCityBySlug($slug, $langCode);
        if ($city !== null && $template !== '') {
            return str_replace('{city}', $city['prepositional'], $template);
        }
        return $base;
    }

    /**
     * Резолвит URL-slug в данные города из dealers.json + city-cases.json.
     *
     * @return array{name: string, prepositional: string, slug: string}|null
     */
    public function resolveCityBySlug(string $slug, string $langCode): ?array
    {
        $slug = trim($slug);
        if ($slug === '' || $langCode === '') {
            return null;
        }
        $dealers = $this->loadJson("data/json/{$langCode}/pages/dealers.json");
        if (!is_array($dealers) || !isset($dealers['items']) || !is_array($dealers['items'])) {
            return null;
        }
        $cases = $this->loadJson("data/json/{$langCode}/city-cases.json");
        if (!is_array($cases)) {
            $cases = [];
        }

        $seen = [];
        foreach ($dealers['items'] as $dealer) {
            if (!is_array($dealer)) {
                continue;
            }
            $city = isset($dealer['city']) && is_string($dealer['city']) ? trim($dealer['city']) : '';
            if ($city === '' || isset($seen[$city])) {
                continue;
            }
            $seen[$city] = true;
            if (CitySlugger::slug($city) === $slug) {
                return [
                    'name' => $city,
                    'prepositional' => isset($cases[$city]) && is_string($cases[$city]) ? $cases[$city] : $city,
                    'slug' => $slug,
                ];
            }
        }
        return null;
    }

    /**
     * Возвращает { width, height } для пути из манифеста (tools/build/images.js).
     *
     * @return array{width: int, height: int}|null
     */
    /**
     * Путь в манифесте: относительно data/img (например intro/cover.jpg или restaurants/.../1.jpg).
     * В шаблон может приходить с префиксом data/img/ — он отрезается при поиске.
     */
    public function getImageDimensions(string $path): ?array
    {
        $path = ltrim(str_replace('\\', '/', $path), '/');
        $path = preg_replace('#^data/img/#', '', $path);
        if ($path === '') {
            return null;
        }
        if ($this->imageDimensionsManifest === null) {
            $this->imageDimensionsManifest = Json::load($this->baseDir . '/data/img/image-dimensions.json') ?? [];
        }
        $entry = $this->imageDimensionsManifest[$path] ?? null;
        if (!is_array($entry) || !isset($entry['width'], $entry['height'])) {
            return null;
        }
        return ['width' => (int) $entry['width'], 'height' => (int) $entry['height']];
    }

    public function loadJson(string $relativePath): ?array
    {
        $relativePath = ltrim($relativePath, '/');

        if (array_key_exists($relativePath, $this->cache)) {
            return $this->cache[$relativePath];
        }

        $data = Json::load($this->baseDir . '/' . $relativePath);
        if ($data === null) {
            $this->cache[$relativePath] = null;
            return null;
        }

        JsonProcessor::processJsonPaths($data, $this->baseUrl);
        $this->cache[$relativePath] = $data;

        return $data;
    }
}
