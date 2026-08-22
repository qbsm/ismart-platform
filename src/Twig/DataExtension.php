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
            new TwigFunction('image_fallback', [$this, 'imageFallback']),
            new TwigFunction('image_largest', [$this, 'imageLargest']),
            new TwigFunction('gallery_layout', [$this, 'galleryLayout']),
            new TwigFunction('gallery_visible_count', [$this, 'galleryVisibleCount']),
            new TwigFunction('city_to_slug', [CitySlugger::class, 'slug']),
            new TwigFunction('resolve_city_by_slug', [$this, 'resolveCityBySlug']),
            new TwigFunction('resolve_section_meta', [$this, 'resolveSectionMeta']),
            new TwigFunction('inline_svg', [$this, 'inlineSvg'], ['is_safe' => ['html']]),
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
    /**
     * Вставляет SVG в разметку как есть — чтобы его внутренности были доступны CSS.
     * Через <img> покрасить отдельный элемент логотипа нельзя.
     *
     * Читает только .svg из data/img: подставлять сюда произвольные пути незачем.
     */
    public function inlineSvg(string $path, string $class = ''): string
    {
        $relative = ltrim(str_replace('\\', '/', $path), '/');
        if (!str_starts_with($relative, 'data/img/') || !str_ends_with($relative, '.svg')) {
            return '';
        }
        if (str_contains($relative, '..')) {
            return '';
        }

        $file = $this->baseDir . '/' . $relative;
        if (!is_file($file)) {
            return '';
        }

        $svg = (string) file_get_contents($file);
        if ($svg === '') {
            return '';
        }

        if ($class !== '') {
            $svg = preg_replace(
                '/<svg\b/',
                '<svg class="' . htmlspecialchars($class, ENT_QUOTES, 'UTF-8') . '"',
                $svg,
                1
            ) ?? $svg;
        }

        return $svg;
    }

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
     * Возвращает наименьший доступный webp-вариант для raw-path.
     *
     * Используется в card-секциях (card-news, card-tire и т.п.) для
     * `<div style="background-image: url(...)">` или `<img src="...">` —
     * когда нужен один путь, не srcset. Берётся самый маленький ключ
     * (обычно 400) — экономит трафик в card-grid'ах.
     *
     * Если raw не валиден или manifest пуст → ''.
     */
    public function imageFallback(string $rawPath): string
    {
        foreach ($this->imageVariants($rawPath) as $variant) {
            if (is_array($variant) && !empty($variant['webp'])) {
                return $variant['webp'];
            }
        }
        return '';
    }

    /**
     * Возвращает наибольший доступный webp-вариант для raw-path.
     *
     * Нужен там, где снимок открывают целиком — лайтбокс галереи, ссылка «во весь
     * экран». Исходник в `raw/` для этого не годится: он есть не у всех кадров, а
     * где есть — весит в разы больше собранного webp.
     *
     * Если raw не валиден или manifest пуст → ''.
     */
    public function imageLargest(string $rawPath): string
    {
        $largest = '';
        foreach ($this->imageVariants($rawPath) as $variant) {
            if (is_array($variant) && !empty($variant['webp'])) {
                $largest = $variant['webp'];
            }
        }
        return $largest;
    }

    /**
     * Сколько кадров галереи показать до кнопки «показать ещё».
     *
     * Резать по счёту нельзя: если обрыв приходится на середину ряда, последний видимый
     * кадр повисает один. Отсчитываем целыми рядами — ширины кадров заданы в данных.
     *
     * @param array<int, mixed> $items
     */
    public function galleryVisibleCount(array $items, int $rows = 3): int
    {
        $shown = 0;
        $filled = 0;
        $width = 0;

        foreach ($items as $item) {
            $span = is_array($item) ? (int) ($item['span'] ?? 4) : 4;
            $shown++;
            $width += $span;

            if ($width >= 12) {
                $filled++;
                $width = 0;
                if ($filled >= $rows) {
                    return $shown;
                }
            }
        }

        return $shown;
    }

    /**
     * Типичное соотношение сторон съёмки — медиана по кадрам.
     *
     * Среднее подводит: один панорамный кадр среди дюжины обычных сдвинул бы всю раскладку.
     *
     * @param array<int, mixed> $items
     */
    private function typicalRatio(array $items): float
    {
        $ratios = [];
        foreach ($items as $item) {
            $src = is_array($item) ? (string) ($item['src'] ?? '') : (string) $item;
            if ($src === '') {
                continue;
            }
            $variant = $this->imageFallback($src);
            $dims = $variant !== '' ? $this->getImageDimensions($variant) : null;
            if ($dims !== null && $dims['height'] > 0) {
                $ratios[] = $dims['width'] / $dims['height'];
            }
        }

        if ($ratios === []) {
            return 1.6;
        }

        sort($ratios);

        return $ratios[intdiv(count($ratios), 2)];
    }

    /**
     * Раскладка галереи: ширины кадров по двенадцатиколоночной сетке.
     *
     * Ряды намеренно смешанные — крупный кадр рядом с мелкими, а не «все по трети».
     * $ratio — типичное соотношение сторон съёмки: под кадры 4:3 берётся набор рядов
     * с ячейками поспокойнее, иначе широкая ячейка срежет у кадра половину высоты.
     * Внутри ряда высота одна: соотношение сторон каждого кадра считается как его ширина,
     * делённая на общий для ряда коэффициент, поэтому ряд читается как одна полоса.
     * Набор рядов подобран так, что любое количество кадров укладывается без остатка.
     *
     * @param array<int, mixed> $items кадры галереи
     * @return array<int, array{span: int, lead: bool, ratio: string}>
     */
    public function galleryLayout(array $items): array
    {
        $count = count($items);
        if ($count < 1) {
            return [];
        }

        $ratio = $this->typicalRatio($items);

        // Ряды: [ширины кадров, коэффициент высоты]. Соотношение ячейки — ширина / коэффициент,
        // поэтому внутри ряда высота одна.
        //
        // Наборов два. Широкий — для съёмки в 16:9, там панорама во всю ширину смотрится
        // как задумано. Спокойный — для кадров 4:3: растянутая на всю ширину ячейка срезала
        // бы у такого кадра почти половину высоты, поэтому ячейки в нём заметно ближе
        // к исходной пропорции.
        // Внутри ряда ячейки одинаковой ширины: в ряду «широкая плюс узкая» при общей высоте
        // узкая неизбежно становится квадратной, и кадр 4:3 теряет в ней половину высоты.
        // Разнокалиберность даёт чередование рядов — полоса во всю ширину, пара, тройка,
        // четвёрка, — а пропорция ячейки подгоняется под саму съёмку.
        $wide = $ratio >= 1.6;

        $rows = $wide ? [
            [[12], 5.0],
            [[6, 6], 3.4],
            [[4, 4, 4], 2.4],
            [[3, 3, 3, 3], 1.8],
        ] : [
            [[12], 8.0],
            [[6, 6], 4.0],
            [[4, 4, 4], 3.0],
            [[3, 3, 3, 3], 2.25],
        ];

        $pick = static fn(int $width): array => array_values(array_filter(
            $rows,
            static fn(array $row): bool => count($row[0]) === $width
        ))[0];

        // Хвосты: чем закрыть последние кадры, чтобы ряд не остался неполным
        $tails = [
            1 => [$pick(1)],
            2 => [$pick(2)],
            3 => [$pick(3)],
            4 => [$pick(2), $pick(2)],  // не четыре марки в ряд, а две пары крупных
            5 => [$pick(2), $pick(3)],  // пара и тройка читаются лучше, чем полоса и четыре марки
            6 => [$pick(3), $pick(3)],
            7 => [$pick(3), $pick(4)],
            8 => [$pick(4), $pick(4)],
            9 => [$pick(2), $pick(3), $pick(4)],
        ];

        $out = [];
        $left = $count;
        $cursor = 0;

        while ($left > 0) {
            if ($left <= 9) {
                foreach ($tails[$left] as $row) {
                    $out[] = $row;
                }
                break;
            }

            // Остаток в девять кадров и меньше закрывает хвост выше, поэтому здесь
            // любой ряд заведомо помещается.
            $row = $rows[$cursor % count($rows)];
            $cursor++;
            $out[] = $row;
            $left -= count($row[0]);
        }

        $items = [];
        foreach ($out as [$widths, $k]) {
            foreach ($widths as $i => $span) {
                // Высоту ряда задаёт первый кадр своим соотношением, остальные тянутся до неё.
                // Считать соотношение каждому нельзя: ширина ячейки включает зазоры между
                // колонками, и у кадров разной ширины высота разошлась бы на несколько пикселей.
                $items[] = [
                    'span' => $span,
                    'lead' => $i === 0,
                    'ratio' => $i === 0
                        ? $span . ' / ' . rtrim(rtrim(number_format($k, 2, '.', ''), '0'), '.')
                        : '',
                ];
            }
        }

        return $items;
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
