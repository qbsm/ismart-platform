<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Support\Arr;
use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Резервная отправка заявки в наш сервис (rescue-канал).
 *
 * Забирает на себя всё, кроме CallTouch: почту, телеграм, таблицы. Смысл в том, что приёмник
 * сначала сохраняет заявку, и только потом раздаёт её по каналам с повторами — упавший канал
 * перестаёт означать потерянный лид. На сайтах обратное поведение уже стоило заявок: когда на
 * promo.avilon-changanauto.ru одновременно отказали почта и CallTouch, 30 заявок не сохранились
 * нигде, а форма при этом отвечала «успешно отправлена».
 *
 * CallTouch остаётся на стороне сайта: ему нужны ключи конкретного кабинета и sessionId из
 * браузера, а автопрозвон должен уходить сразу, без очереди.
 *
 * Канал добавочный, а не замещающий: mail/telegram/google_sheets остаются в ядре и включаются
 * своими флагами. Там, где политика заказчика запрещает отдавать данные в сторонний сервис,
 * достаточно не включать этот канал — сайт продолжит рассылать сам, как раньше.
 *
 * Подтверждение отправителя: приёмник сверяет домен с адресом, с которого пришёл запрос —
 * заявку шлёт бэкенд сайта, значит с того же IP, на который резолвится домен. Ключ нужен
 * только там, где это не так (хостинг клиента за CDN или общим адресом).
 */
final class RescueChannel implements ChannelInterface
{
    /**
     * @param array{enable?: bool, url?: string, site?: string, key?: string, timeout?: int} $config
     */
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly array $config,
    ) {}

    public function name(): string
    {
        return 'rescue';
    }

    public function isEnabled(): bool
    {
        return ($this->config['enable'] ?? false) === true
            && ($this->config['url'] ?? '') !== ''
            && ($this->config['site'] ?? '') !== '';
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        $payload = $this->buildPayload($formData, $requestId);
        $timeout = (float) ($this->config['timeout'] ?? 10);

        try {
            $response = $this->httpClient->request('POST', (string) $this->config['url'], [
                'headers' => ['Content-Type' => 'application/json'],
                'body' => (string) json_encode($payload, JSON_UNESCAPED_UNICODE),
                'timeout' => $timeout,
                'max_duration' => $timeout,
            ]);
            $httpCode = $response->getStatusCode();
            $decoded = $response->toArray(false);
        } catch (TransportException | ExceptionInterface $e) {
            $this->logger->error('Rescue: запрос не прошёл', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        }

        if ($httpCode >= 200 && $httpCode < 300 && ($decoded['ok'] ?? false)) {
            $id = (string) ($decoded['id'] ?? '');
            // duplicate=true — повтор с тем же request_id, приёмник его распознал. Это успех:
            // обращение уже у него, дубля не создалось.
            $this->logger->info('Rescue: принято', [
                'request_id' => $requestId,
                'id' => $id,
                'duplicate' => (bool) ($decoded['duplicate'] ?? false),
            ]);
            return ChannelResult::success($this->name(), ['id' => $id]);
        }

        $message = (string) ($decoded['error'] ?? 'unknown_error');
        $context = ['request_id' => $requestId, 'http_code' => $httpCode, 'message' => $message];

        // 4xx — приёмник данные не принял, повтор не поможет: это предупреждение, не отказ канала.
        if ($httpCode >= 400 && $httpCode < 500) {
            $this->logger->warning('Rescue: отклонено', $context);
            return ChannelResult::warning($this->name(), $message, ['http_code' => $httpCode]);
        }

        $this->logger->error('Rescue: не доставлено', $context);
        return ChannelResult::failed($this->name(), $message, ['http_code' => $httpCode]);
    }

    /**
     * Досылает итоги остальных каналов: ушла ли заявка в CallTouch на прозвон, дошло ли
     * письмо. Отдельным запросом, потому что rescue вызывается первым — заявка должна быть
     * сохранена раньше любых попыток доставки, и в тот момент итогов ещё нет.
     *
     * Ошибки здесь не влияют ни на что: заявка уже принята, это только пометка для отчётности.
     *
     * @param array<string,string> $channels
     */
    public function reportChannels(array $channels, string $requestId): void
    {
        if (!$this->isEnabled() || $requestId === '' || $channels === []) {
            return;
        }

        $payload = [
            'site' => (string) $this->config['site'],
            'request_id' => $requestId,
            'channels' => $channels,
        ];
        if (($this->config['key'] ?? '') !== '') {
            $payload['key'] = (string) $this->config['key'];
        }

        try {
            $this->httpClient->request('POST', $this->channelsUrl(), [
                'headers' => ['Content-Type' => 'application/json'],
                'body' => (string) json_encode($payload, JSON_UNESCAPED_UNICODE),
                'timeout' => 3,
                'max_duration' => 3,
            ])->getStatusCode();
        } catch (TransportException | ExceptionInterface $e) {
            $this->logger->info('Rescue: итоги каналов не доехали', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function channelsUrl(): string
    {
        return rtrim((string) $this->config['url'], '/') . '/channels';
    }

    /**
     * @param array<string,mixed> $formData
     * @return array<string,mixed>
     */
    private function buildPayload(array $formData, string $requestId): array
    {
        $payload = [
            'site' => (string) $this->config['site'],
            // request_id — идемпотентность и сшивка с маячками: ключ сессии формы живёт
            // от первого касания до успешной отправки, по нему приёмник находит попытку.
            // Повтор при таймауте несёт тот же ключ и дубля не создаст. Серверный
            // correlation id — запасной путь для заявок мимо нашего фронта.
            'request_id' => Arr::str($formData, 'idempotency_key') ?: $requestId,
        ];

        if (($this->config['key'] ?? '') !== '') {
            $payload['key'] = (string) $this->config['key'];
        }

        // Поля формы отдаём как есть: приёмник хранит заявку целиком, а не фиксированный набор.
        foreach ($formData as $k => $v) {
            if (is_scalar($v) && (string) $v !== '') {
                $payload[(string) $k] = (string) $v;
            }
        }

        return $payload;
    }
}
