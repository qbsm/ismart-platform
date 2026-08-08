<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Чтение переменных окружения с поддержкой прежних имён.
 *
 * Имена приводятся к одному правилу: префикс совпадает с именем канала
 * (`mail`, `calltouch`, `telegram`, `sheets`, `api`), дальше параметр — `_ENABLE`,
 * `_TIMEOUT` и специфичные. Исторически они разошлись на пять схем (`CT_`, `TG_`,
 * `GS_`, `MAILER_`, `LEADS_API_`), а `.env` живут на двадцати с лишним деплойментах
 * вне git — переименовать разом нельзя. Поэтому новое имя читается первым, прежнее
 * остаётся запасным: `.env` можно приводить в порядок постепенно, ничего не ломая.
 */
final class Env
{
    /**
     * Первое непустое значение из перечисленных имён.
     *
     * @param string $name   каноническое имя
     * @param string ...$legacy прежние имена, по убыванию давности
     */
    public static function get(string $name, string ...$legacy): string
    {
        foreach ([$name, ...$legacy] as $key) {
            $value = getenv($key);
            if ($value !== false && $value !== '') {
                return (string) $value;
            }
        }

        return '';
    }

    /** Булево значение: 1/true/yes/on — истина, всё прочее — ложь. */
    public static function bool(string $name, string ...$legacy): bool
    {
        return filter_var(self::get($name, ...$legacy), FILTER_VALIDATE_BOOLEAN);
    }

    /** Целое с запасным значением, если переменная не задана. */
    public static function int(string $name, int $default, string ...$legacy): int
    {
        $value = self::get($name, ...$legacy);

        return $value === '' ? $default : (int) $value;
    }
}
