<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Типизированный доступ к ключам массива settings.
 *
 * Убирает разбросанные по приложению повторы вида
 * `(array) ($settings['route_map'] ?? [])` — оставляет одно место правды
 * для дефолтов и обеспечения типов.
 */
final class PlatformSettings
{
    /** @param array<string,mixed> $settings */
    public static function defaultLang(array $settings): string
    {
        return (string) ($settings['default_lang'] ?? 'ru');
    }

    /**
     * @param array<string,mixed> $settings
     * @return array<int,string>
     */
    public static function availableLangs(array $settings): array
    {
        $langs = $settings['available_langs'] ?? ['ru'];
        return is_array($langs) ? array_values(array_map('strval', $langs)) : ['ru'];
    }

    /**
     * @param array<string,mixed> $settings
     * @return array<string,string>
     */
    public static function routeMap(array $settings): array
    {
        return is_array($settings['route_map'] ?? null) ? $settings['route_map'] : [];
    }

    /**
     * @param array<string,mixed> $settings
     * @return array<string,array<string,mixed>>
     */
    public static function collections(array $settings): array
    {
        return is_array($settings['collections'] ?? null) ? $settings['collections'] : [];
    }

    private function __construct()
    {
    }
}
