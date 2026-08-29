<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Типизированное чтение переменных окружения.
 *
 * Имена — по единому правилу: префикс совпадает с именем канала или подсистемы
 * (`APP_`, `MAIL_`, `CALLTOUCH_`, `TELEGRAM_`, `SHEETS_`, `RESCUE_`), дальше параметр,
 * у каждого канала есть `_ENABLE` и `_TIMEOUT`. Полный список — reference/env.md на docs.ismart.pro.
 */
final class Env
{
    /** Значение переменной или пустая строка, если не задана. */
    public static function get(string $name): string
    {
        $value = getenv($name);

        return $value === false ? '' : (string) $value;
    }

    /** Булево: 1/true/yes/on — истина, всё прочее — ложь. */
    public static function bool(string $name): bool
    {
        return filter_var(self::get($name), FILTER_VALIDATE_BOOLEAN);
    }

    /** Целое, или $default, если переменная не задана. */
    public static function int(string $name, int $default): int
    {
        $value = self::get($name);

        return $value === '' ? $default : (int) $value;
    }
}
