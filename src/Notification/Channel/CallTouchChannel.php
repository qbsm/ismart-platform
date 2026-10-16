<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Отправка лида в CallTouch. Два режима — выбор по тому, какие доступы выданы:
 *
 * - callback: автопрозвон формы. Нужны route_key («ключ виджета для автопрозвона
 *   форм сайта») и token. CallTouch сам перезванивает клиенту.
 * - request: регистрация заявки. Нужен только числовой site_id (ID личного
 *   кабинета), токен не требуется. Лид попадает в CallTouch с атрибуцией, но
 *   без автопрозвона.
 *
 * Кабинеты выдают наборы вразнобой: где-то есть route_key без токена, где-то
 * токен и site_id без route_key. Режим выбирается по полноте набора, callback
 * приоритетнее — он делает больше.
 */
final class CallTouchChannel implements ChannelInterface
{
    private const CALLBACK_URL = 'https://api.calltouch.ru/widget-service/v1/api/widget-request/user-form/create';
    private const REQUEST_URL = 'https://api.calltouch.ru/calls-service/RestAPI/requests/%s/register/';
    private const ERROR_VALIDATION_CODE = 10007;

    /**
     * @param array{enable?: bool, route_key?: string, token?: string, site_id?: string, timeout?: int} $config
     */
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly array $config,
    ) {}

    public function name(): string
    {
        return 'calltouch';
    }

    public function isEnabled(): bool
    {
        return ($this->config['enable'] ?? false) === true
            && ($this->hasCallbackCredentials() || $this->hasRequestCredentials());
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        return $this->hasCallbackCredentials()
            ? $this->sendCallback($formData, $requestId)
            : $this->sendRequest($formData, $requestId);
    }

    private function hasCallbackCredentials(): bool
    {
        return ($this->config['route_key'] ?? '') !== '' && ($this->config['token'] ?? '') !== '';
    }

    private function hasRequestCredentials(): bool
    {
        return ($this->config['site_id'] ?? '') !== '';
    }

    private function timeout(): float
    {
        return (float) ($this->config['timeout'] ?? 10);
    }

    private function sendCallback(array $formData, string $requestId): ChannelResult
    {
        $payload = $this->buildCallbackPayload($formData);

        if ($payload['phone'] === '') {
            return ChannelResult::warning($this->name(), 'empty_phone');
        }

        try {
            $response = $this->httpClient->request('POST', self::CALLBACK_URL, [
                'headers' => [
                    'Access-Token' => (string) ($this->config['token'] ?? ''),
                    'Content-Type' => 'application/json',
                ],
                'body' => (string) json_encode($payload, JSON_UNESCAPED_UNICODE),
                'timeout' => $this->timeout(),
                'max_duration' => $this->timeout(),
            ]);
            $httpCode = $response->getStatusCode();
            $decoded = $response->toArray(false);
        } catch (TransportException|ExceptionInterface $e) {
            $this->logger->error('CallTouch: ошибка запроса автопрозвона', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        }

        if ($httpCode === 200 && !empty($decoded['data']['widgetRequestId'])) {
            $widgetId = (string) $decoded['data']['widgetRequestId'];
            $this->logger->info('CallTouch: автопрозвон принят', [
                'request_id' => $requestId,
                'widget_request_id' => $widgetId,
            ]);
            return ChannelResult::success($this->name(), ['widget_request_id' => $widgetId]);
        }

        $errorCode = $decoded['data']['apiErrorData']['errorCode'] ?? null;
        $isValidation = $errorCode === self::ERROR_VALIDATION_CODE
            || isset($decoded['data']['validationErrorData']);

        $message = (string) (
            $decoded['data']['apiErrorData']['errorMessage']
            ?? $decoded['data']['validationErrorData']['violations'][0]['message']
            ?? 'unknown_error'
        );

        $context = ['request_id' => $requestId, 'http_code' => $httpCode, 'message' => $message];

        if ($isValidation) {
            $this->logger->warning('CallTouch: автопрозвон отклонён валидацией', $context);
            return ChannelResult::warning($this->name(), $message, ['http_code' => $httpCode]);
        }

        $this->logger->error('CallTouch: автопрозвон не отправлен', $context);
        return ChannelResult::failed($this->name(), $message, ['http_code' => $httpCode]);
    }

    private function sendRequest(array $formData, string $requestId): ChannelResult
    {
        $payload = $this->buildRequestPayload($formData);

        // Метод требует хотя бы одно из полей контакта
        if (($payload['phoneNumber'] ?? '') === ''
            && ($payload['fio'] ?? '') === ''
            && ($payload['email'] ?? '') === ''
        ) {
            return ChannelResult::warning($this->name(), 'empty_contacts');
        }

        $url = sprintf(self::REQUEST_URL, rawurlencode((string) ($this->config['site_id'] ?? '')));

        try {
            $response = $this->httpClient->request('POST', $url, [
                'headers' => ['Content-Type' => 'application/x-www-form-urlencoded'],
                'body' => $payload,
                'timeout' => $this->timeout(),
                'max_duration' => $this->timeout(),
            ]);
            $httpCode = $response->getStatusCode();
            $decoded = $response->toArray(false);
        } catch (TransportException|ExceptionInterface $e) {
            $this->logger->error('CallTouch: ошибка запроса заявки', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        }

        $errorMessage = (string) ($decoded['message'] ?? $decoded['errorMessage'] ?? '');
        $hasError = isset($decoded['errorCode']) || $errorMessage !== '';

        if ($httpCode === 200 && !$hasError) {
            $ctRequestId = (string) ($decoded['requestId'] ?? $decoded['id'] ?? '');
            $this->logger->info('CallTouch: заявка зарегистрирована', [
                'request_id' => $requestId,
                'ct_request_id' => $ctRequestId,
            ]);
            return ChannelResult::success($this->name(), ['ct_request_id' => $ctRequestId]);
        }

        $message = $errorMessage !== '' ? $errorMessage : 'unknown_error';
        $context = ['request_id' => $requestId, 'http_code' => $httpCode, 'message' => $message];

        // 4xx — данные не приняты, повтор не поможет: это предупреждение, не отказ канала
        if ($httpCode >= 400 && $httpCode < 500) {
            $this->logger->warning('CallTouch: заявка отклонена', $context);
            return ChannelResult::warning($this->name(), $message, ['http_code' => $httpCode]);
        }

        $this->logger->error('CallTouch: заявка не отправлена', $context);
        return ChannelResult::failed($this->name(), $message, ['http_code' => $httpCode]);
    }

    /**
     * @param array<string,mixed> $formData
     * @return array<string,string>
     */
    private function buildCallbackPayload(array $formData): array
    {
        $payload = [
            'routeKey' => (string) ($this->config['route_key'] ?? ''),
            'phone' => $this->normalizePhone($formData),
        ];

        $sessionId = $this->sessionId($formData);
        if ($sessionId !== '') {
            $payload['sessionId'] = $sessionId;
        }

        $utmMap = [
            'utm_source' => 'utmSource',
            'utm_medium' => 'utmMedium',
            'utm_campaign' => 'utmCampaign',
            'utm_content' => 'utmContent',
            'utm_term' => 'utmTerm',
        ];
        foreach ($utmMap as $from => $to) {
            if (isset($formData[$from]) && is_string($formData[$from]) && $formData[$from] !== '') {
                $payload[$to] = $formData[$from];
            }
        }

        return $payload;
    }

    /**
     * @param array<string,mixed> $formData
     * @return array<string,string>
     */
    private function buildRequestPayload(array $formData): array
    {
        $payload = [
            'phoneNumber' => $this->normalizePhone($formData),
            'fio' => trim((string) ($formData['name'] ?? $formData['fio'] ?? '')),
            'email' => trim((string) ($formData['email'] ?? '')),
        ];

        $subject = trim((string) ($formData['form_name'] ?? $formData['subject'] ?? $formData['source'] ?? ''));
        if ($subject !== '') {
            $payload['subject'] = mb_substr($subject, 0, 256);
        }

        $comment = trim((string) ($formData['comment'] ?? $formData['message'] ?? ''));
        if ($comment !== '') {
            $payload['comment'] = $comment;
        }

        // current_url — имя, под которым страницу заявки шлёт форма платформы.
        $requestUrl = trim((string) (
            $formData['request_url']
            ?? $formData['requestUrl']
            ?? $formData['page_url']
            ?? $formData['current_url']
            ?? ''
        ));
        if ($requestUrl !== '') {
            $payload['requestUrl'] = $requestUrl;
        }

        // Без sessionId источник заявки не определяется; пустым слать нельзя —
        // такой запрос CallTouch отклоняет целиком.
        $sessionId = $this->sessionId($formData);
        if ($sessionId !== '') {
            $payload['sessionId'] = $sessionId;
        }

        return array_filter($payload, static fn(string $v): bool => $v !== '');
    }

    /**
     * @param array<string,mixed> $formData
     */
    private function normalizePhone(array $formData): string
    {
        $phone = preg_replace('/\D+/', '', (string) ($formData['phone'] ?? '')) ?? '';
        if ($phone !== '' && $phone[0] === '8') {
            $phone = '7' . substr($phone, 1);
        }

        return $phone;
    }

    /**
     * @param array<string,mixed> $formData
     */
    private function sessionId(array $formData): string
    {
        return (string) (
            $formData['session_id']
            ?? $formData['sessionId']
            ?? $_COOKIE['_ct_session_id']
            ?? ''
        );
    }
}
