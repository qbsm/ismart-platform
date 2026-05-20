#!/usr/bin/env php
<?php

/**
 * Генерация public/llms-full.txt для GEO (LLM-краулеры).
 * Универсальное ядро: список коллекций и полей задаётся в config/llms-full.php.
 * Без конфига или с пустым collections выводится только заголовок.
 *
 * Использование:
 *   php tools/ops/generate-llms-full.php [project_root]
 *   php tools/ops/generate-llms-full.php > public/llms-full.txt
 */

$projectRoot = isset($argv[1]) ? rtrim($argv[1], '/') : dirname(__DIR__, 2);
$dataDir = $projectRoot . '/data/json';
$configPath = $projectRoot . '/config/llms-full.php';

if (!is_dir($dataDir)) {
    fwrite(STDERR, "Data directory not found: {$dataDir}\n");
    exit(1);
}

$config = [];
if (is_readable($configPath)) {
    $config = (array) require $configPath;
}

$collections = (array) ($config['collections'] ?? []);
$title = (string) ($config['title'] ?? 'Platform');
$intro = (string) ($config['intro'] ?? 'Детальная информация о разделах платформы.');

$globalPath = $dataDir . '/global.json';
$langs = ['ru'];
if (is_readable($globalPath)) {
    $global = json_decode((string) file_get_contents($globalPath), true);
    if (isset($global['lang']) && is_array($global['lang'])) {
        $langs = array_values(array_filter(array_map(
            static function ($item) {
                return is_array($item) && isset($item['code']) ? $item['code'] : null;
            },
            $global['lang']
        )));
    }
}

$lines = [
    '# ' . $title . ' — расширенное описание для LLM',
    '',
    $intro,
    '',
];

foreach ($langs as $lang) {
    $langDir = $dataDir . '/' . $lang;
    if (!is_dir($langDir)) {
        continue;
    }

    $lines[] = '## Язык: ' . $lang;
    $lines[] = '';

    foreach ($collections as $coll) {
        $listPath = str_replace('{lang}', $lang, (string) ($coll['list_path'] ?? ''));
        $listKey = (string) ($coll['list_key'] ?? 'items');
        $itemDir = str_replace('{lang}', $lang, (string) ($coll['item_dir'] ?? ''));
        $nameKey = (string) ($coll['name_key'] ?? 'name');
        $descKey = isset($coll['desc_key']) ? (string) $coll['desc_key'] : null;
        $visibleKey = isset($coll['visible_key']) ? (string) $coll['visible_key'] : null;
        $fields = (array) ($coll['fields'] ?? []);

        $listFullPath = $dataDir . '/' . $listPath;
        $slugs = [];
        if (is_readable($listFullPath)) {
            $data = json_decode((string) file_get_contents($listFullPath), true);
            if (isset($data[$listKey]) && is_array($data[$listKey])) {
                $slugs = $data[$listKey];
            }
        }

        $itemBaseDir = $dataDir . '/' . $itemDir;
        if (!is_dir($itemBaseDir)) {
            continue;
        }

        foreach ($slugs as $slug) {
            $path = $itemBaseDir . '/' . $slug . '.json';
            if (!is_readable($path)) {
                continue;
            }
            $json = json_decode((string) file_get_contents($path), true);
            if (!is_array($json)) {
                continue;
            }

            if ($visibleKey !== null && isset($json[$visibleKey]) && $json[$visibleKey] === false) {
                continue;
            }

            $name = getByPath($json, $nameKey);
            $lines[] = '### ' . (is_string($name) ? $name : $slug);
            $lines[] = 'Slug: ' . $slug;
            if ($descKey !== null) {
                $desc = getByPath($json, $descKey);
                if ($desc !== null && $desc !== '') {
                    $lines[] = 'Описание: ' . trim(preg_replace('/\s+/', ' ', (string) $desc));
                }
            }
            foreach ($fields as $field) {
                $label = (string) ($field['label'] ?? '');
                $key = (string) ($field['key'] ?? '');
                if ($key === '') {
                    continue;
                }
                $value = getByPath($json, $key);
                $formatted = formatValue($value, $key);
                if ($formatted !== '') {
                    $lines[] = $label . ': ' . $formatted;
                }
            }
            $lines[] = '';
        }
    }
}

echo implode("\n", $lines);

/**
 * @param array<string, mixed> $data
 * @return mixed
 */
function getByPath(array $data, string $path)
{
    $keys = explode('.', $path);
    $current = $data;
    foreach ($keys as $k) {
        if (!is_array($current) || !array_key_exists($k, $current)) {
            return null;
        }
        $current = $current[$k];
    }
    return $current;
}

/**
 * @param mixed $value
 */
function formatValue($value, string $key): string
{
    if ($value === null) {
        return '';
    }
    if (is_scalar($value)) {
        return (string) $value;
    }
    if (!is_array($value)) {
        return '';
    }
    // PostalAddress-like
    if (isset($value['streetAddress']) || isset($value['addressLocality'])) {
        $parts = array_filter([
            $value['streetAddress'] ?? '',
            $value['addressLocality'] ?? '',
            $value['addressRegion'] ?? '',
            $value['addressCountry'] ?? '',
        ]);
        return implode(', ', $parts);
    }
    // openingHours-like: [ {days, hours}, ... ]
    if (isset($value[0]) && is_array($value[0]) && (array_key_exists('days', $value[0]) || array_key_exists('hours', $value[0]))) {
        $formatted = array_map(static function ($h) {
            return trim(($h['days'] ?? '') . ' ' . ($h['hours'] ?? ''));
        }, $value);
        return implode('; ', $formatted);
    }
    // array of strings
    if (array_values($value) === $value && (empty($value) || is_string($value[0] ?? null))) {
        return implode(', ', $value);
    }
    return '';
}
