<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Support\AfterResponse;
use App\Support\Arr;
use App\Support\RescueQueue;
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
 *
 * С очередью (RescueQueue, в ядре включена по умолчанию, RESCUE_QUEUE) сбой сети или 5xx приёмника
 * заявку не теряет: она ложится в очередь и досылается после ответа посетителю, после следующей
 * заявки и командой `php tools/ops/rescue.php flush` (таймер площадки). Без очереди — одна попытка.
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
        private readonly ?RescueQueue $queue = null,
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
        $answer = $this->deliver($payload, (float) ($this->config['timeout'] ?? 10), $requestId);

        if ($answer['outcome'] === RescueQueue::SENT) {
            // Приёмник снова доступен — заодно уходят застрявшие в очереди.
            if ($this->queue !== null && $this->queue->items() !== []) {
                AfterResponse::defer(fn() => $this->flushQueue());
            }
            return ChannelResult::success($this->name(), ['id' => $answer['id']]);
        }

        // 4xx — приёмник данные не принял, повтор не поможет: это предупреждение, не отказ канала.
        if ($answer['outcome'] === RescueQueue::REJECT) {
            return ChannelResult::warning($this->name(), $answer['message'], ['http_code' => $answer['http_code']]);
        }

        if ($this->queue !== null && $this->queue->enqueue($payload)) {
            $this->logger->warning('Rescue: не дошло, заявка в очереди досылки', [
                'request_id' => $requestId,
                'error' => $answer['message'],
            ]);
            AfterResponse::defer(fn() => $this->flushQueue());
            return ChannelResult::success($this->name(), ['queued' => true]);
        }

        return ChannelResult::failed($this->name(), $answer['message'], ['http_code' => $answer['http_code']]);
    }

    /**
     * Досылка очереди. После ответа посетителю и из консоли ждём дольше, чем в запросе формы:
     * кнопку это уже не держит.
     *
     * @return array{sent:int, left:int}
     */
    public function flushQueue(): array
    {
        if ($this->queue === null || !$this->isEnabled()) {
            return ['sent' => 0, 'left' => $this->queue === null ? 0 : count($this->queue->items())];
        }
        $timeout = max(10.0, (float) ($this->config['timeout'] ?? 10));
        return $this->queue->flush(fn(string $kind, array $payload): string => $kind === RescueQueue::CHANNELS
            ? $this->deliverChannels($payload, $timeout)
            : $this->deliver($payload, $timeout, (string) ($payload['request_id'] ?? ''))['outcome']);
    }

    /**
     * Один запрос в приёмник. outcome — RescueQueue::SENT, RETRY (сеть, DNS, 5xx) или REJECT (4xx).
     *
     * @param array<string,mixed> $payload
     * @return array{outcome:string, message:string, http_code:int, id:string}
     */
    private function deliver(array $payload, float $timeout, string $requestId): array
    {
        try {
            $response = $this->httpClient->request('POST', (string) $this->config['url'], [
                'headers' => ['Content-Type' => 'application/json'],
                'body' => (string) json_encode($payload, JSON_UNESCAPED_UNICODE),
                'timeout' => $timeout,
                'max_duration' => $timeout,
            ]);
            $httpCode = $response->getStatusCode();
            $decoded = $response->toArray(false);
        } catch (TransportException|ExceptionInterface $e) {
            $this->logger->error('Rescue: запрос не прошёл', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ['outcome' => RescueQueue::RETRY, 'message' => $e->getMessage(), 'http_code' => 0, 'id' => ''];
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
            return ['outcome' => RescueQueue::SENT, 'message' => '', 'http_code' => $httpCode, 'id' => $id];
        }

        $message = (string) ($decoded['error'] ?? 'unknown_error');
        $context = ['request_id' => $requestId, 'http_code' => $httpCode, 'message' => $message];

        if ($httpCode >= 400 && $httpCode < 500) {
            $this->logger->warning('Rescue: отклонено', $context);
            return ['outcome' => RescueQueue::REJECT, 'message' => $message, 'http_code' => $httpCode, 'id' => ''];
        }

        $this->logger->error('Rescue: не доставлено', $context);
        return ['outcome' => RescueQueue::RETRY, 'message' => $message, 'http_code' => $httpCode, 'id' => ''];
    }

    /**
     * Досылает итоги остальных каналов: ушла ли заявка в CallTouch на прозвон, дошло ли
     * письмо. Отдельным запросом, потому что rescue вызывается первым — заявка должна быть
     * сохранена раньше любых попыток доставки, и в тот момент итогов ещё нет.
     *
     * Ошибки здесь не влияют ни на что: заявка уже принята, это только пометка для отчётности.
     * С очередью итоги уходят после ответа посетителю, с настоящими итогами отложенных каналов. Если
     * сама заявка ещё ждёт в очереди, итоги встают следом за ней: приёмник принимает их только к
     * известной заявке (иначе 404).
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

        if ($this->queue === null) {
            $this->deliverChannels($payload, 3.0);
            return;
        }
        // После ответа и после отложенных каналов (письмо, Telegram — DeferredChannel): их задачи
        // встали в AfterResponse раньше, к этому моменту настоящий итог уже известен.
        $queue = $this->queue;
        AfterResponse::defer(function () use ($payload, $queue, $requestId): void {
            $payload['channels'] = array_merge($payload['channels'], DeferredChannel::results());
            if ($queue->hasLead($requestId)) {
                $queue->enqueue($payload, RescueQueue::CHANNELS);
                return;
            }
            if ($this->deliverChannels($payload, 10.0) === RescueQueue::RETRY) {
                $queue->enqueue($payload, RescueQueue::CHANNELS);
            }
        });
    }

    /**
     * Итоги каналов в приёмник. SENT — приняты; RETRY — сеть, 5xx или 404 (заявки у приёмника ещё
     * нет); REJECT — прочие 4xx.
     *
     * @param array<string,mixed> $payload
     */
    private function deliverChannels(array $payload, float $timeout): string
    {
        $requestId = (string) ($payload['request_id'] ?? '');
        try {
            $code = $this->httpClient->request('POST', $this->channelsUrl(), [
                'headers' => ['Content-Type' => 'application/json'],
                'body' => (string) json_encode($payload, JSON_UNESCAPED_UNICODE),
                'timeout' => $timeout,
                'max_duration' => $timeout,
            ])->getStatusCode();
        } catch (TransportException|ExceptionInterface $e) {
            $this->logger->info('Rescue: итоги каналов не доехали', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return RescueQueue::RETRY;
        }
        if ($code >= 200 && $code < 300) {
            return RescueQueue::SENT;
        }
        $this->logger->info('Rescue: итоги каналов не приняты', ['request_id' => $requestId, 'http_code' => $code]);
        return $code === 404 || $code >= 500 ? RescueQueue::RETRY : RescueQueue::REJECT;
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
