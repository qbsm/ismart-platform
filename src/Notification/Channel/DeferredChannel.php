<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use App\Support\AfterResponse;
use Psr\Log\LoggerInterface;

/**
 * Канал, который отправляет после ответа посетителю (AfterResponse). Какие каналы так обёрнуты —
 * FORM_DEFER_CHANNELS (mail, telegram), по умолчанию ни один.
 *
 * На avtofin до 25.10.2026 письмо и Telegram шли до ответа, и форма ждала SMTP и Telegram — с учётом
 * медленного DNS это секунды на кнопке. Заявка к этому моменту уже сохранена (приёмник или его
 * очередь), так что ответ «отправлено» честный. Настоящий итог канала попадает в results() — его берёт отчёт
 * о каналах в приёмник (RescueChannel::reportChannels), который тоже уходит после ответа и позже.
 * С вложенными файлами — сразу: временные файлы загрузки живут только до конца запроса.
 */
final class DeferredChannel implements ChannelInterface
{
    /** @var array<string,string> канал → итог (ChannelResult::state) отложенных отправок этого запроса */
    private static array $results = [];

    public function __construct(
        private readonly ChannelInterface $inner,
        private readonly LoggerInterface $logger,
    ) {}

    /** @return array<string,string> */
    public static function results(): array
    {
        return self::$results;
    }

    public function name(): string
    {
        return $this->inner->name();
    }

    public function isEnabled(): bool
    {
        return $this->inner->isEnabled();
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        if ($uploadedFiles !== []) {
            return $this->inner->send($formData, $uploadedFiles, $requestId);
        }

        AfterResponse::defer(function () use ($formData, $requestId): void {
            $result = $this->inner->send($formData, [], $requestId);
            self::$results[$this->name()] = $result->state();
            if ($result->status === ChannelResult::STATUS_FAILED) {
                $this->logger->warning('Канал не доставил', [
                    'channel' => $this->name(),
                    'message' => $result->message,
                    'request_id' => $requestId,
                ]);
            }
        });

        return ChannelResult::success($this->name(), ['deferred' => true]);
    }
}
