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
    private bool $imageManifestExists = false;
    /** @var list<string>|null */
    private ?array $imageSizeKeys = null;

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
            new TwigFunction('image_has', [$this, 'imageHas']),
            new TwigFunction('image_variants', [$this, 'imageVariants']),
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
     * Возвращает { width, height } для пути из манифеста (tools/build/build-images.js).
     *
     * Принимает любую форму пути:
     *   data/img/intro/800/foo.webp
     *   /data/img/intro/800/foo.webp
     *   https://host/data/img/intro/800/foo.webp
     *   intro/800/foo.webp
     *
     * @return array{width: int, height: int}|null
     */
    public function getImageDimensions(string $path): ?array
    {
        $key = $this->normalizeManifestKey($path);
        if ($key === '') {
            return null;
        }
        $this->loadImageDimensionsManifest();
        $entry = $this->imageDimensionsManifest[$key] ?? null;
        if ($entry === null) {
            return null;
        }
        return ['width' => $entry['width'], 'height' => $entry['height']];
    }

    /**
     * Проверяет наличие файла изображения в манифесте.
     *
     * Используется в picture.twig для гейтинга `<source>` и srcset items — чтобы не
     * эмитить пути к несуществующим файлам (например, AVIF, пропущенный из-за
     * skip-upscale в build-images.js).
     *
     * Graceful fallback: если манифест не существует на диске (свежий клон без
     * `npm run build:images`), возвращает `true` — шаблон ведёт себя как до
     * введения гейтинга, эмитит всё, что в JSON.
     */
    public function imageHas(string $path): bool
    {
        $key = $this->normalizeManifestKey($path);
        if ($key === '') {
            return false;
        }
        $this->loadImageDimensionsManifest();
        if (!$this->imageManifestExists) {
            return true;
        }
        return isset($this->imageDimensionsManifest[$key]);
    }

    private function normalizeManifestKey(string $path): string
    {
        $path = str_replace('\\', '/', $path);
        $path = preg_replace('#^https?://[^/]+/#', '', $path) ?? $path;
        $path = ltrim($path, '/');
        return preg_replace('#^data/img/#', '', $path) ?? $path;
    }

    /**
     * Для raw-path возвращает резолвнутые ключи (proposal 0003, raw-source contract).
     *
     * Вход:  "data/img/intro/raw/desk-lemons.webp"
     * Выход: [
     *   '400'  => ['webp' => 'data/img/intro/400/desk-lemons.webp', 'avif' => 'data/img/intro/400/desk-lemons.avif'],
     *   '800'  => ['webp' => 'data/img/intro/800/desk-lemons.webp', 'avif' => null],
     *   '1600' => null,  // вообще не сгенерирован под этот ключ
     * ]
     *
     * Только downscale: эмитим ключи, которые реально есть в manifest'е.
     * Если в пути нет `/raw/` сегмента → возвращаем [] (контракт нарушен).
     * Если манифест отсутствует на диске → возвращаем [] (build:images не запускался).
     *
     * @return array<string, array{webp: ?string, avif: ?string}|null>
     */
    public function imageVariants(string $rawPath): array
    {
        $pattern = $this->extractPatternFromRawPath($rawPath);
        if ($pattern === null) {
            return [];
        }
        $this->loadImageDimensionsManifest();
        if (!$this->imageManifestExists) {
            return [];
        }

        $variants = [];
        foreach ($this->loadImageSizeKeys() as $key) {
            $webpKey = $pattern['dir'] . $key . '/' . $pattern['basename'] . '.webp';
            $avifKey = $pattern['dir'] . $key . '/' . $pattern['basename'] . '.avif';

            $hasWebp = isset($this->imageDimensionsManifest[$webpKey]);
            $hasAvif = isset($this->imageDimensionsManifest[$avifKey]);

            $variants[$key] = ($hasWebp || $hasAvif)
                ? [
                    'webp' => $hasWebp ? 'data/img/' . $webpKey : null,
                    'avif' => $hasAvif ? 'data/img/' . $avifKey : null,
                ]
                : null;
        }
        return $variants;
    }

    /**
     * Извлекает (dir, basename) из raw-path для resolve в manifest.
     *
     * "data/img/intro/raw/desk-lemons.webp" → ['dir' => 'intro/', 'basename' => 'desk-lemons']
     * "data/img/restaurants/X/raw/cover.jpg" → ['dir' => 'restaurants/X/', 'basename' => 'cover']
     *
     * Возвращает null если в пути нет `/raw/` сегмента (контракт нарушен).
     *
     * @return array{dir: string, basename: string}|null
     */
    private function extractPatternFromRawPath(string $rawPath): ?array
    {
        $path = $this->normalizeManifestKey($rawPath);
        if ($path === '' || !str_contains($path, '/raw/')) {
            return null;
        }
        $cleaned = str_replace('/raw/', '/', $path);
        $info = pathinfo($cleaned);
        $dir = $info['dirname'];
        $dirPrefix = ($dir === '.' || $dir === '') ? '' : $dir . '/';
        return [
            'dir' => $dirPrefix,
            'basename' => $info['filename'],
        ];
    }

    /**
     * @return list<string>
     */
    private function loadImageSizeKeys(): array
    {
        if ($this->imageSizeKeys !== null) {
            return $this->imageSizeKeys;
        }
        $path = $this->baseDir . '/config/image-sizes.json';
        $data = is_file($path) ? Json::load($path) : null;
        $keys = is_array($data) && isset($data['keys']) && is_array($data['keys'])
            ? $data['keys']
            : ['400', '800', '1280', '1600', '1920', '2560'];
        $this->imageSizeKeys = array_values(array_map('strval', $keys));
        return $this->imageSizeKeys;
    }

    private function loadImageDimensionsManifest(): void
    {
        if ($this->imageDimensionsManifest !== null) {
            return;
        }
        $manifestPath = $this->baseDir . '/assets/img/build/image-dimensions.json';
        $this->imageManifestExists = is_file($manifestPath);
        $this->imageDimensionsManifest = Json::load($manifestPath) ?? [];
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
