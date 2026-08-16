<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Токен формы, живущий без сессии: время выдачи плюс подпись.
 *
 * Сессионный токен зависит от куки, а её теряют — приватный режим, блокировщики, ITP. Потеря
 * куки означала бы отказ на отправке уже заполненной формы, то есть потерянную заявку.
 * Самодостаточный токен от этого не зависит: сервер проверяет подпись и возраст.
 *
 * Возраст — вторая половина смысла. Токен выдаётся по запросу браузера, а не в HTML, поэтому
 * между выдачей и отправкой проходит время реального заполнения. Заявка, пришедшая мгновенно
 * после выдачи, набрана не человеком.
 */
final class FormToken
{
    private const SEPARATOR = '.';
    private const SIGNATURE_LENGTH = 32;

    public function __construct(
        private readonly string $secret,
        private readonly int $minAge = 3,
        private readonly int $maxAge = 7200,
    ) {}

    public function issue(?int $now = null): string
    {
        $issuedAt = $now ?? time();
        return $issuedAt . self::SEPARATOR . $this->sign((string) $issuedAt);
    }

    /**
     * @return array{valid: bool, reason: string, age: int}
     */
    public function inspect(string $token, ?int $now = null): array
    {
        $now ??= time();
        $parts = explode(self::SEPARATOR, $token, 2);

        if (count($parts) !== 2 || $parts[0] === '' || !ctype_digit($parts[0])) {
            return ['valid' => false, 'reason' => 'malformed', 'age' => 0];
        }

        if (!hash_equals($this->sign($parts[0]), $parts[1])) {
            return ['valid' => false, 'reason' => 'signature', 'age' => 0];
        }

        $age = $now - (int) $parts[0];

        if ($age < 0 || $age > $this->maxAge) {
            return ['valid' => false, 'reason' => 'expired', 'age' => $age];
        }

        if ($age < $this->minAge) {
            return ['valid' => false, 'reason' => 'too_fast', 'age' => $age];
        }

        return ['valid' => true, 'reason' => '', 'age' => $age];
    }

    public function minAge(): int
    {
        return $this->minAge;
    }

    /**
     * Служебный ключ iSmart: канарейка и сквозные прогоны ходят мимо фронта, токена и капчи
     * у них нет. Ключ выводится из того же секрета площадки и домена, поэтому не хранится
     * и не раскатывается: hmac(host, secret). Заявка с верным ключом помечается тестовой —
     * приёмник такие заказчику не показывает. Механизм общий с парком БорисХоф.
     */
    public function serviceKey(string $host): string
    {
        $site = strtolower(explode(':', $host)[0]);
        return $this->sign($site);
    }

    public function serviceKeyMatches(string $given, string $host): bool
    {
        $given = trim($given);
        if ($this->secret === '' || $given === '' || $host === '') {
            return false;
        }

        return hash_equals($this->serviceKey($host), $given);
    }

    private function sign(string $payload): string
    {
        return substr(hash_hmac('sha256', $payload, $this->secret), 0, self::SIGNATURE_LENGTH);
    }
}
