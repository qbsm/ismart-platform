<?php

declare(strict_types=1);

namespace App\Notification;

final class ChannelResult
{
    public const STATUS_SUCCESS = 'success';
    public const STATUS_WARNING = 'warning';
    public const STATUS_FAILED = 'failed';
    public const STATUS_DISABLED = 'disabled';

    /**
     * @param array<string,mixed> $meta
     */
    private function __construct(
        public readonly string $channel,
        public readonly string $status,
        public readonly string $message,
        public readonly array $meta,
    ) {}

    /**
     * @param array<string,mixed> $meta
     */
    public static function success(string $channel, array $meta = []): self
    {
        return new self($channel, self::STATUS_SUCCESS, '', $meta);
    }

    /**
     * @param array<string,mixed> $meta
     */
    public static function warning(string $channel, string $message, array $meta = []): self
    {
        return new self($channel, self::STATUS_WARNING, $message, $meta);
    }

    /**
     * @param array<string,mixed> $meta
     */
    public static function failed(string $channel, string $message, array $meta = []): self
    {
        return new self($channel, self::STATUS_FAILED, $message, $meta);
    }

    public static function disabled(string $channel): self
    {
        return new self($channel, self::STATUS_DISABLED, '', []);
    }

    public function isSuccess(): bool
    {
        return $this->status === self::STATUS_SUCCESS;
    }

    /**
     * Статус с причиной: `failed (Ошибка валидации…)`.
     *
     * Приёмник хранит эту строку в колонке каналов и приводит причину к канону, поэтому
     * голый `failed` читается там как «ОТКАЗ (причина не передана)» — по такой строке
     * непонятно ни что чинить, ни видел ли кабинет заявку вообще. Посетителю причина не
     * нужна: в ответ формы уходит чистый статус.
     */
    public function state(): string
    {
        if ($this->message === '' || $this->status === self::STATUS_SUCCESS) {
            return $this->status;
        }
        $note = trim((string) preg_replace('/\s+/u', ' ', $this->message));
        return $note === '' ? $this->status : $this->status . ' (' . mb_substr($note, 0, 120) . ')';
    }
}
