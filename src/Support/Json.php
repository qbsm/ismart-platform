<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Унифицированная загрузка JSON-файлов.
 *
 * До выделения этого модуля паттерн "is_file → file_get_contents → json_decode → is_array"
 * был повторён в DataLoaderService, SitemapAction, RedirectMiddleware, RateLimitMiddleware,
 * Twig\AssetExtension, Twig\DataExtension — каждый со своими нюансами error-handling.
 */
final class Json
{
    /**
     * Загружает JSON-файл и возвращает декодированный массив.
     * Возвращает null, если файла нет, чтение/парсинг провалились или результат — не массив.
     *
     * @return array<mixed>|null
     */
    public static function load(string $path): ?array
    {
        if (!is_file($path) || !is_readable($path)) {
            return null;
        }
        $raw = @file_get_contents($path);
        if ($raw === false) {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    /**
     * Загружает JSON и возвращает значение по верхнеуровневому ключу (если массив).
     * Удобно для list-страниц вида `{"items": [...]}`.
     *
     * @return array<mixed>|null
     */
    public static function loadKey(string $path, string $key): ?array
    {
        $data = self::load($path);
        if ($data === null) {
            return null;
        }
        return isset($data[$key]) && is_array($data[$key]) ? $data[$key] : null;
    }

    private function __construct()
    {
    }
}
