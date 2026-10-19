<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Транслитерация русских названий городов в URL-slug.
 * Зеркало assets/js/utils/translit.js — обе реализации должны давать одинаковый результат.
 */
final class CitySlugger
{
    /** @var array<string,string> */
    private const CYRILLIC_TO_LATIN = [
        'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'yo',
        'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm',
        'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u',
        'ф' => 'f', 'х' => 'kh', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sch',
        'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
    ];

    /** @var array<string,string> */
    private const CITY_OVERRIDES = [
        'москва' => 'moscow',
        'санкт-петербург' => 'saint-petersburg',
        'нижний новгород' => 'nizhny-novgorod',
        'ростов-на-дону' => 'rostov-on-don',
        'екатеринбург' => 'ekaterinburg',
        'новосибирск' => 'novosibirsk',
        'казань' => 'kazan',
        'красноярск' => 'krasnoyarsk',
        'челябинск' => 'chelyabinsk',
        'самара' => 'samara',
        'уфа' => 'ufa',
        'пермь' => 'perm',
        'воронеж' => 'voronezh',
        'волгоград' => 'volgograd',
        'краснодар' => 'krasnodar',
        'сочи' => 'sochi',
        'тюмень' => 'tyumen',
        'ярославль' => 'yaroslavl',
        'тольятти' => 'togliatti',
    ];

    public static function slug(string $city): string
    {
        $normalized = mb_strtolower(trim($city), 'UTF-8');
        if ($normalized === '') {
            return '';
        }

        $base = self::CITY_OVERRIDES[$normalized] ?? self::transliterate($normalized);
        $slug = preg_replace('/[^a-z0-9]+/u', '-', $base) ?? '';
        return trim($slug, '-');
    }

    private static function transliterate(string $value): string
    {
        $result = '';
        $length = mb_strlen($value, 'UTF-8');
        for ($i = 0; $i < $length; $i++) {
            $char = mb_substr($value, $i, 1, 'UTF-8');
            $result .= self::CYRILLIC_TO_LATIN[$char] ?? $char;
        }
        return $result;
    }
}
