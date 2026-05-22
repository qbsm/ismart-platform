<?php

declare(strict_types=1);

namespace App\Notification;

interface ChannelInterface
{
    public function name(): string;

    public function isEnabled(): bool;

    /**
     * @param array<string,mixed> $formData
     * @param array<string,mixed> $uploadedFiles PSR-7 UploadedFileInterface[] (каналы могут игнорировать)
     */
    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult;
}
