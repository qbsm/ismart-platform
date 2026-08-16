<?php

declare(strict_types=1);

namespace App\Action;

use App\Middleware\CorrelationIdMiddleware;
use App\Notification\Channel\RescueChannel;
use App\Support\Arr;
use App\Support\FormToken;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * Копия контакта, оставленного в виджете обратного звонка CallTouch.
 *
 * Виджет постит заявку напрямую в CallTouch, минуя наш бэкенд, — это единственный источник
 * обращений, которого нет ни в нашей базе, ни в аналитике. Фронт снимает номер из поля виджета и
 * присылает сюда, а мы кладём его в приёмник заявок как обычную форму.
 *
 * Шлём ТОЛЬКО в rescue: звонок уже инициировал сам виджет, и отправка в CallTouch отсюда
 * означала бы вторую заявку в кабинете и второй звонок клиенту. Почта с телеграмом молчат по
 * той же причине — дублировать уведомления о том, что уже ушло в CallTouch, незачем.
 */
final class ApiWidgetRescueAction
{
    public function __construct(
        private readonly RescueChannel $rescue,
        private readonly LoggerInterface $logger,
        private readonly FormToken $formToken,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start(['cache_limiter' => '']);
        }

        $requestId = (string) $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');
        $parsed = $request->getParsedBody();
        $data = is_array($parsed) ? $parsed : [];

        if (!$this->formToken->inspect(Arr::str($data, 'form_token'))['valid']) {
            return $this->json($response, 419, ['success' => false, 'code' => 'TOKEN_INVALID', 'request_id' => $requestId]);
        }

        $digits = preg_replace('/\D+/', '', Arr::str($data, 'phone')) ?? '';
        if (strlen($digits) < 10 || strlen($digits) > 15) {
            // Виджет шлёт номер по мере набора; неполный — не заявка, а промежуточное состояние.
            return $this->json($response, 422, ['success' => false, 'code' => 'PHONE_INVALID', 'request_id' => $requestId]);
        }

        if (!$this->rescue->isEnabled()) {
            return $this->json($response, 200, ['success' => true, 'registered' => false, 'request_id' => $requestId]);
        }

        $payload = $data;
        unset($payload['csrf_token'], $payload['form_token']);
        $payload['form_name'] = 'Виджет обратного звонка CallTouch';
        $payload['_user_agent'] = (string) ($request->getHeaderLine('User-Agent') ?: '');

        try {
            $result = $this->rescue->send($payload, [], $requestId);
        } catch (Throwable $e) {
            $this->logger->error('Виджет CallTouch: копия заявки не ушла', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return $this->json($response, 200, ['success' => true, 'registered' => false, 'request_id' => $requestId]);
        }

        // Заявку в CallTouch создал сам виджет, слать её туда второй раз нечего — но в отчёте
        // каналов это читается как «отправлено через виджет»: исход кабинета остаётся внутри
        // виджета, и утверждать успех мы не вправе — номер там мог не пройти проверку.
        if ($result->status === 'success') {
            $this->rescue->reportChannels(['calltouch' => 'sent'], $requestId);
        }

        return $this->json($response, 200, [
            'success' => true,
            'registered' => $result->status === 'success',
            'request_id' => $requestId,
        ]);
    }

    /**
     * @param array<string,mixed> $payload
     */
    private function json(ResponseInterface $response, int $status, array $payload): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus($status);
    }
}
