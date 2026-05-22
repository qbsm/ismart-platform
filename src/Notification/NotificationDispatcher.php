<?php

declare(strict_types=1);

namespace App\Notification;

use Psr\Log\LoggerInterface;
use Throwable;

final class NotificationDispatcher
{
    /**
     * @param iterable<ChannelInterface> $channels
     */
    public function __construct(
        private readonly iterable $channels,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Sequential dispatch. Любая ошибка канала изолируется и логируется,
     * другие каналы продолжают выполняться.
     *
     * @param array<string,mixed> $formData
     * @param array<string,mixed> $uploadedFiles
     * @return ChannelResult[]
     */
    public function dispatch(array $formData, array $uploadedFiles, string $requestId): array
    {
        $results = [];
        foreach ($this->channels as $channel) {
            $name = $channel->name();

            if (!$channel->isEnabled()) {
                $results[] = ChannelResult::disabled($name);
                continue;
            }

            try {
                $result = $channel->send($formData, $uploadedFiles, $requestId);
            } catch (Throwable $e) {
                $this->logger->error('Notification channel threw exception', [
                    'channel' => $name,
                    'request_id' => $requestId,
                    'error' => $e->getMessage(),
                ]);
                $result = ChannelResult::failed($name, $e->getMessage());
            }

            $results[] = $result;
        }

        return $results;
    }
}
