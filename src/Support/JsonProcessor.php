<?php

namespace App\Support;

final class JsonProcessor
{
    /**
     * Рекурсивно нормализует пути data/* в абсолютные URL.
     *
     * @param mixed $data
     */
    public static function processJsonPaths(&$data, string $baseUrl): void
    {
        $baseUrl = rtrim($baseUrl, '/') . '/';
        $baseUrlData = $baseUrl . 'data/';

        if (!is_array($data) && !is_object($data)) {
            return;
        }

        foreach ($data as &$value) {
            if (is_array($value) || is_object($value)) {
                self::processJsonPaths($value, $baseUrl);
                continue;
            }

            if (!is_string($value)) {
                continue;
            }

            if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
                continue;
            }

            if (str_starts_with($value, '/data/')) {
                $value = $baseUrlData . ltrim(substr($value, strlen('/data/')), '/');
            } elseif (str_starts_with($value, 'data/')) {
                $value = $baseUrl . $value;
            }
        }
        unset($value);
    }
}
