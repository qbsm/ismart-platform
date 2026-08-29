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
}
