<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Читаемый вид номера для людей: в каналы форма отдаёт одни цифры (маску срезает фронт),
 * и в письме менеджера номер выглядел как «79657284277». Машинным получателям (CallTouch,
 * приёмник заявок) по-прежнему уходят цифры — форматируем только то, что читает человек.
 */
final class Phone
{
    public static function format(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';

        if ($digits === '') {
            return trim($raw);
        }

        if (strlen($digits) === 11 && ($digits[0] === '7' || $digits[0] === '8')) {
            return sprintf(
                '+7 (%s) %s-%s-%s',
                substr($digits, 1, 3),
                substr($digits, 4, 3),
                substr($digits, 7, 2),
                substr($digits, 9, 2),
            );
        }

        return '+' . $digits;
    }
}
