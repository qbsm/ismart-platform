<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Идентификаторы посетителя из кук аналитики. Сессия CallTouch говорит только о текущем
 * визите: человек, пришедший второй раз, выглядит новым, и заявка не сцепляется с прошлым
 * визитом ни в кабинете, ни в отчёте конверсии. Сквозные идентификаторы живут дольше сессии
 * и закрывают этот разрыв.
 *
 * Читаем на сервере, а не во фронте: куки и так приходят с запросом формы, а поле, которое
 * кладёт JS, теряется везде, где форма отправляется мимо нашего бандла.
 */
final class VisitorIds
{
    /** Идентификатор посетителя CallTouch — живёт между сессиями, в отличие от `_ct_session_id`. */
    private const CT_CLIENT_COOKIE = '_ct_client_global_id';

    /** Кука GA: `GA1.1.<clientId>.<timestamp>`; идентификатором считается всё после префикса. */
    private const GA_COOKIE = '_ga';

    /**
     * @param array<string,mixed> $cookies
     * @return array<string,string> Непустые значения: ct_client_id, ga_client_id.
     */
    public static function fromCookies(array $cookies): array
    {
        $ids = [];

        $ctClient = self::cookie($cookies, self::CT_CLIENT_COOKIE);
        if ($ctClient !== '') {
            $ids['ct_client_id'] = $ctClient;
        }

        $ga = self::gaClientId(self::cookie($cookies, self::GA_COOKIE));
        if ($ga !== '') {
            $ids['ga_client_id'] = $ga;
        }

        return $ids;
    }

    /**
     * Добавляет идентификаторы к данным заявки, не затирая то, что прислала форма:
     * значение из формы — осознанное, кука — догадка сервера.
     *
     * @param array<string,mixed> $data
     * @param array<string,mixed> $cookies
     * @return array<string,mixed>
     */
    public static function enrich(array $data, array $cookies): array
    {
        foreach (self::fromCookies($cookies) as $key => $value) {
            if (Arr::str($data, $key) === '') {
                $data[$key] = $value;
            }
        }

        return $data;
    }

    /** `GA1.1.1234567890.1690000000` → `1234567890.1690000000`. */
    public static function gaClientId(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            return '';
        }

        return (string) preg_replace('/^GA\d+\.\d+\./', '', $raw);
    }

    /** @param array<string,mixed> $cookies */
    private static function cookie(array $cookies, string $name): string
    {
        $value = $cookies[$name] ?? '';

        return is_string($value) ? trim($value) : '';
    }
}
