<?php

namespace App\Service;

use App\Support\Json;
use App\Support\JsonProcessor;

final class DataLoaderService
{
    /**
     * Загружает global.json — глобальные данные сайта (навигация, контакты, языки).
     *
     * @param string $globalPath Абсолютный путь к global.json
     * @param string $baseUrl    Базовый URL для обработки путей изображений
     * @return array<string,mixed> Данные global.json или [] при отсутствии файла
     */
    public function loadGlobal(string $globalPath, string $baseUrl): array
    {
        return $this->loadJson($globalPath, $baseUrl) ?? [];
    }

    /**
     * Загружает данные страницы по page_id.
     *
     * @param string $pagesDir Директория страниц (data/json/{lang}/pages)
     * @param string $pageId   Идентификатор страницы (имя файла без .json)
     * @param string $baseUrl  Базовый URL для обработки путей
     * @return array<string,mixed>|null Данные страницы или null если файл не найден
     */
    public function loadPage(string $pagesDir, string $pageId, string $baseUrl): ?array
    {
        $path = rtrim($pagesDir, '/') . '/' . $pageId . '.json';
        return $this->loadJson($path, $baseUrl);
    }

    /**
     * Загружает SEO-данные страницы (title, meta, json_ld).
     *
     * @param string $jsonBaseDir Корневая директория JSON (data/json)
     * @param string $langCode   Код языка (ru, en)
     * @param string $pageId     Идентификатор страницы
     * @param string $baseUrl    Базовый URL для обработки путей
     * @return array<string,mixed>|null SEO-данные или null если файл не найден
     */
    public function loadSeo(string $jsonBaseDir, string $langCode, string $pageId, string $baseUrl): ?array
    {
        $seoPath = rtrim($jsonBaseDir, '/') . '/' . $langCode . '/seo/' . $pageId . '.json';
        return $this->loadJson($seoPath, $baseUrl);
    }

    /**
     * Загружает список slug'ов коллекции из страницы-списка.
     *
     * Алгоритм поиска:
     * 1. Прямой ключ $data[$slugsSource] (например items)
     * 2. Fallback: sections[name={nav_slug}].data.items
     * Поддерживает строковые slug'и и объекты {"slug": "..."}.
     *
     * @param string              $jsonBaseDir      Корневая директория JSON (data/json)
     * @param string              $langCode         Код языка (ru, en)
     * @param array<string,mixed> $collectionConfig Конфиг коллекции (nav_slug, slugs_source)
     * @return array<int,string>|null Массив slug'ов или null если не найдены
     */
    public function loadEntitySlugs(string $jsonBaseDir, string $langCode, array $collectionConfig): ?array
    {
        $navSlug = (string) ($collectionConfig['nav_slug'] ?? '');
        $slugsPage = (string) ($collectionConfig['slugs_page'] ?? $navSlug);
        $slugsSource = (string) ($collectionConfig['slugs_source'] ?? 'items');

        $path = rtrim($jsonBaseDir, '/') . '/' . $langCode . '/pages/' . $slugsPage . '.json';
        $data = $this->loadJson($path, '');
        if (!is_array($data)) {
            return null;
        }

        $rawItems = [];
        if (isset($data[$slugsSource]) && is_array($data[$slugsSource])) {
            $rawItems = $data[$slugsSource];
        }

        if ($rawItems === [] && isset($data['sections']) && is_array($data['sections'])) {
            foreach ($data['sections'] as $section) {
                if (
                    is_array($section)
                    && ($section['name'] ?? '') === $navSlug
                    && isset($section['data']['items'])
                    && is_array($section['data']['items'])
                ) {
                    $rawItems = $section['data']['items'];
                    break;
                }
            }
        }

        $slugs = [];
        foreach ($rawItems as $item) {
            if (is_string($item) && $item !== '') {
                $slugs[] = $item;
                continue;
            }
            if (is_array($item) && isset($item['slug']) && is_string($item['slug']) && $item['slug'] !== '') {
                $slugs[] = $item['slug'];
            }
        }

        return $slugs === [] ? null : array_values(array_unique($slugs));
    }

    /**
     * Загружает данные одной сущности коллекции.
     *
     * Проверяет наличие item_key и visible !== false.
     * Устанавливает $data['slug'] = $slug.
     *
     * @param string              $jsonBaseDir      Корневая директория JSON (data/json)
     * @param string              $langCode         Код языка (ru, en)
     * @param string              $slug             Slug сущности (имя файла без .json)
     * @param string              $baseUrl          Базовый URL для обработки путей
     * @param array<string,mixed> $collectionConfig Конфиг коллекции (data_dir, item_key)
     * @return array<string,mixed>|null Данные сущности или null если не найдена/скрыта
     */
    public function loadEntity(string $jsonBaseDir, string $langCode, string $slug, string $baseUrl, array $collectionConfig): ?array
    {
        $dataDir = (string) ($collectionConfig['data_dir'] ?? '');
        $itemKey = (string) ($collectionConfig['item_key'] ?? '');

        $path = rtrim($jsonBaseDir, '/') . '/' . $langCode . '/' . $dataDir . '/' . $slug . '.json';
        $data = $this->loadJson($path, $baseUrl);
        if ($data === null) {
            return null;
        }
        if ($itemKey !== '' && empty($data[$itemKey])) {
            return null;
        }
        if (isset($data['visible']) && $data['visible'] === false) {
            return null;
        }

        $data['slug'] = $slug;
        return $data;
    }

    /**
     * Читает и декодирует JSON-файл, обрабатывает пути через JsonProcessor.
     *
     * @param string $path    Абсолютный путь к JSON-файлу
     * @param string $baseUrl Базовый URL для замены относительных путей
     * @return array<string,mixed>|null Декодированные данные или null при ошибке
     */
    public function loadJson(string $path, string $baseUrl): ?array
    {
        $data = Json::load($path);
        if ($data === null) {
            return null;
        }

        JsonProcessor::processJsonPaths($data, $baseUrl);
        return $data;
    }

    /**
     * Резолвит `data.items_from` в секциях страницы (ADR-0004).
     *
     * Идёт по `$pageData['sections']`. Для секций с непустым `data.items_from`
     * и пустым `data.items`:
     *  - Находит коллекцию в `$collections` (ключ === items_from ИЛИ nav_slug коллекции).
     *  - Резолвит slug'и: declared order через loadEntitySlugs; иначе directory scan + natural sort.
     *  - Каждый slug → loadEntity (visibility/item_key как обычно) → flat-формат.
     *  - Опция `data.limit` (int) — обрезает результат.
     *
     * Backward-compat: секции с непустым `data.items` не перезаписываются.
     *
     * @param array<string,mixed> $pageData     Данные страницы (модифицируются by-ref)
     * @param array<string,mixed> $collections  config/project.php :: collections
     * @param string              $jsonBaseDir  Корневая директория JSON
     * @param string              $langCode     Код языка
     * @param string              $baseUrl      Базовый URL для путей в entity
     */
    public function injectItemsFrom(array &$pageData, array $collections, string $jsonBaseDir, string $langCode, string $baseUrl): void
    {
        if (!isset($pageData['sections']) || !is_array($pageData['sections'])) {
            return;
        }

        $sections = &$pageData['sections'];
        foreach ($sections as $idx => $section) {
            if (!is_array($section) || !isset($section['data']) || !is_array($section['data'])) {
                continue;
            }
            $itemsFrom = $section['data']['items_from'] ?? null;
            if (!is_string($itemsFrom) || $itemsFrom === '') {
                continue;
            }
            $existing = $section['data']['items'] ?? null;
            if (is_array($existing) && $existing !== []) {
                continue;
            }

            $collConfig = $this->resolveCollection($itemsFrom, $collections);
            if ($collConfig === null) {
                continue;
            }

            $slugs = $this->loadEntitySlugs($jsonBaseDir, $langCode, $collConfig);
            if ($slugs === null || $slugs === []) {
                $slugs = $this->scanCollectionSlugs($jsonBaseDir, $langCode, $collConfig);
            }
            if ($slugs === []) {
                continue;
            }

            $items = [];
            foreach ($slugs as $slug) {
                $entity = $this->loadEntity($jsonBaseDir, $langCode, $slug, $baseUrl, $collConfig);
                if ($entity === null) {
                    continue;
                }
                $items[] = $this->flattenEntityForList($entity, $collConfig);
            }

            $limit = $section['data']['limit'] ?? null;
            if (is_int($limit) && $limit > 0) {
                $items = array_slice($items, 0, $limit);
            }

            $sections[$idx]['data']['items'] = $items;
        }
    }

    /**
     * Directory scan slug'ов коллекции с natural sort (slug='1','2','10').
     *
     * Используется как fallback в injectItemsFrom, когда list-page не содержит
     * declared order. Заявленный slug-источник на list-page имеет приоритет —
     * этот метод вызывается ТОЛЬКО при его отсутствии.
     *
     * @param array<string,mixed> $collectionConfig
     * @return array<int,string>
     */
    public function scanCollectionSlugs(string $jsonBaseDir, string $langCode, array $collectionConfig): array
    {
        $dataDir = (string) ($collectionConfig['data_dir'] ?? '');
        if ($dataDir === '') {
            return [];
        }
        $dir = rtrim($jsonBaseDir, '/') . '/' . $langCode . '/' . $dataDir;
        if (!is_dir($dir)) {
            return [];
        }
        $files = glob($dir . '/*.json');
        if ($files === false || $files === []) {
            return [];
        }
        $slugs = array_map(static fn(string $path): string => basename($path, '.json'), $files);
        usort($slugs, 'strnatcmp');
        return $slugs;
    }

    /**
     * @param array<string,mixed> $collections
     * @return array<string,mixed>|null
     */
    private function resolveCollection(string $key, array $collections): ?array
    {
        if (isset($collections[$key]) && is_array($collections[$key])) {
            return $collections[$key];
        }
        foreach ($collections as $collConfig) {
            if (is_array($collConfig) && ($collConfig['nav_slug'] ?? '') === $key) {
                return $collConfig;
            }
        }
        return null;
    }

    /**
     * Уплощает entity до flat-формата для list-секций.
     *
     * Совпадает по структуре с PageAction::injectListItems — чтобы Twig-шаблоны
     * получали одинаковую форму данных независимо от пути инжекции (list-page
     * vs. items_from на любой странице).
     *
     * @param array<string,mixed> $entity
     * @param array<string,mixed> $collectionConfig
     * @return array<string,mixed>
     */
    private function flattenEntityForList(array $entity, array $collectionConfig): array
    {
        $itemKey = (string) ($collectionConfig['item_key'] ?? '');
        $inner = $itemKey !== '' ? ($entity[$itemKey] ?? []) : $entity;
        if (!is_array($inner)) {
            $inner = [];
        }
        $flat = [
            'slug' => $entity['slug'] ?? '',
            'id' => $inner['id'] ?? null,
            'visible' => $entity['visible'] ?? true,
            'cover' => $inner['cover'] ?? ['src' => ''],
            'hex' => $inner['hex'] ?? '',
            'date' => $inner['date'] ?? '',
            'title' => $inner['title'] ?? $inner['name'] ?? '',
            'desc' => $inner['desc'] ?? $inner['lead'] ?? '',
            'href' => $inner['href'] ?? '',
        ];
        foreach (['types', 'feature', 'tags', 'category', 'season'] as $extra) {
            if (isset($inner[$extra])) {
                $flat[$extra] = $inner[$extra];
            }
        }
        return $flat;
    }
}
