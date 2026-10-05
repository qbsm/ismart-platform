<?php

declare(strict_types=1);

namespace App\Security;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Проверка ответа Yandex SmartCaptcha.
 *
 * Капча включается точечно и по умолчанию выключена: на большинстве сайтов её роль выполняют
 * токен формы с временем выдачи и скрытая ловушка, а лишний барьер стоит конверсии.
 *
 * Недоступность сервиса заявку не отменяет. Потерять обращение живого человека из-за того, что
 * чужой сервис не ответил, хуже, чем пропустить робота: отказ выносится только по явному
 * вердикту, а сбой транспорта уходит в лог и трактуется в пользу отправителя.
 */
final class CaptchaVerifier
{
    private const ENDPOINT = 'https://smartcaptcha.yandexcloud.net/validate';

    /** Тем же значением фронт сообщает, что виджет не построился из-за настроек кабинета. */
    public const HOST_ERROR = 'host-not-allowed';

    /**
     * @param array{enable?: bool, server_key?: string, client_key?: string, timeout?: int} $config
     */
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly array $config = [],
    ) {}

    public function isEnabled(): bool
    {
        return ($this->config['enable'] ?? false) === true
            && (string) ($this->config['server_key'] ?? '') !== ''
            && (string) ($this->config['client_key'] ?? '') !== '';
    }

    /**
     * @return array{passed: bool, reason: string}
     */
    public function verify(string $token, string $ip, string $requestId): array
    {
        if (!$this->isEnabled()) {
            return ['passed' => true, 'reason' => 'disabled'];
        }

        if ($token === '') {
            return ['passed' => false, 'reason' => 'empty'];
        }

        // Виджет сообщил, что домен не в списке разрешённых в кабинете. Это ошибка настройки,
        // а не признак робота: пропускаем и пишем в лог, иначе одна забытая строка в консоли
        // Yandex Cloud тихо отрезала бы все заявки сайта.
        if ($token === self::HOST_ERROR) {
            $this->logger->error('Капча: домен не разрешён в кабинете, проверка пропущена', [
                'request_id' => $requestId,
            ]);
            return ['passed' => true, 'reason' => 'host_not_allowed'];
        }

        $timeout = (float) ($this->config['timeout'] ?? 5);

        try {
            $response = $this->httpClient->request('POST', self::ENDPOINT, [
                'body' => [
                    'secret' => (string) $this->config['server_key'],
                    'token' => $token,
                    'ip' => $ip,
                ],
                'timeout' => $timeout,
                'max_duration' => $timeout,
            ]);
            $decoded = $response->toArray(false);
        } catch (TransportException|ExceptionInterface $e) {
            $this->logger->warning('Капча: сервис не ответил, заявка пропущена', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ['passed' => true, 'reason' => 'unavailable'];
        }

        $status = (string) ($decoded['status'] ?? '');

        if ($status === 'ok') {
            return ['passed' => true, 'reason' => 'ok'];
        }

        // Пустой статус означает, что ответ не разобрался: считаем это сбоем сервиса, а не
        // вердиктом против отправителя.
        if ($status === '') {
            $this->logger->warning('Капча: непонятный ответ, заявка пропущена', [
                'request_id' => $requestId,
                'answer' => mb_substr((string) json_encode($decoded, JSON_UNESCAPED_UNICODE), 0, 200),
            ]);
            return ['passed' => true, 'reason' => 'unavailable'];
        }

        $this->logger->info('Капча: отказ', [
            'request_id' => $requestId,
            'status' => $status,
            'message' => (string) ($decoded['message'] ?? ''),
        ]);

        return ['passed' => false, 'reason' => $status];
    }
}
