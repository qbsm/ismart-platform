<?php

namespace App\Service;

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
        $slugsSource = (string) ($collectionConfig['slugs_source'] ?? 'items');

        $path = rtrim($jsonBaseDir, '/') . '/' . $langCode . '/pages/' . $navSlug . '.json';
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
        if (!is_file($path)) {
            return null;
        }

        $content = @file_get_contents($path);
        if ($content === false) {
            return null;
        }

        $data = json_decode($content, true);
        if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }

        JsonProcessor::processJsonPaths($data, $baseUrl);
        return $data;
    }
}
