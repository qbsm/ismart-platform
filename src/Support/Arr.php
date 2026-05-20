<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Утилиты для типизированного извлечения значений из ассоциативных массивов.
 * Используется там, где данные приходят из JSON / request body / settings — нужна
 * защита от type juggling и пустых значений в одном выражении.
 */
final class Arr
{
    /** Возвращает trimmed string или '' если ключа нет или значение не строковое. */
    public static function str(array $data, string $key): string
    {
        return isset($data[$key]) && is_string($data[$key]) ? trim($data[$key]) : '';
    }

    /** Возвращает int или 0 если значение не int/numeric-string. */
    public static function int(array $data, string $key): int
    {
        $v = $data[$key] ?? null;
        return is_int($v) ? $v : (is_numeric($v) ? (int) $v : 0);
    }

    /** Возвращает bool с приведением (true/1/'1'/'true' → true). */
    public static function bool(array $data, string $key): bool
    {
        $v = $data[$key] ?? null;
        return $v === true || $v === 1 || $v === '1' || $v === 'true';
    }

    /** Возвращает массив или [] если значение не массив. */
    public static function array(array $data, string $key): array
    {
        return isset($data[$key]) && is_array($data[$key]) ? $data[$key] : [];
    }

    private function __construct()
    {
    }
}
