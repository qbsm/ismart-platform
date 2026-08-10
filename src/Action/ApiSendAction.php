<?php

declare(strict_types=1);

namespace App\Action;

use App\Middleware\CorrelationIdMiddleware;
use App\Notification\ChannelResult;
use App\Notification\Channel\RescueChannel;
use App\Notification\NotificationDispatcher;
use App\Security\CaptchaVerifier;
use App\Support\Arr;
use App\Support\FormToken;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

final class ApiSendAction
{
    /** Имя выбрано правдоподобным: робот заполняет то, что похоже на обычное поле. */
    private const TRAP_FIELD = 'company_site';

    /** Имя поля задано самой SmartCaptcha — виджет кладёт ответ именно в него. */
    private const CAPTCHA_FIELD = 'smart-token';

    public function __construct(
        private readonly NotificationDispatcher $dispatcher,
        private readonly LoggerInterface $logger,
        private readonly FormToken $formToken,
        private readonly RescueChannel $rescue,
        private readonly CaptchaVerifier $captcha,
    ) {}

    /**
     * Источник заявки подтверждает токен, выданный по запросу браузера: он несёт время
     * выдачи, поэтому мгновенная отправка отсекается вместе с подделкой подписи. Причина
     * отказа уходит в лог — молчаливых потерь быть не должно.
     *
     * @param array<string,mixed> $data
     * @return array{status: int, payload: array<string,mixed>}|null
     */
    private function checkToken(array $data, string $requestId, ServerRequestInterface $request): ?array
    {
        $verdict = $this->formToken->inspect(Arr::str($data, 'form_token'));

        if ($verdict['valid']) {
            return null;
        }

        $this->logger->warning('Заявка отклонена проверкой токена', [
            'request_id' => $requestId,
            'reason' => $verdict['reason'],
            'ip' => $this->clientIp($request),
            'user_agent' => $request->getHeaderLine('User-Agent'),
        ]);

        return [
            'status' => 419,
            'payload' => [
                'success' => false,
                'code' => 'TOKEN_INVALID',
                'message' => 'Не удалось подтвердить отправку. Попробуйте ещё раз.',
                'retry_after' => max(1, $this->formToken->minAge()),
                'request_id' => $requestId,
            ],
        ];
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start(['cache_limiter' => '']);
        }

        $this->pruneIdempotencyStore();

        $requestId = (string) $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');
        $parsed = $request->getParsedBody();
        $data = is_array($parsed) ? $parsed : [];
        $idempotencyKey = Arr::str($data, 'idempotency_key');

        // Ловушка: поле спрятано от человека, робот заполняет всё подряд. Отвечаем как при
        // успехе — иначе робот подберёт набор полей и вернётся.
        if (Arr::str($data, self::TRAP_FIELD) !== '') {
            $this->logger->warning('Заявка отброшена ловушкой', [
                'request_id' => $requestId,
                'ip' => $this->clientIp($request),
                'user_agent' => $request->getHeaderLine('User-Agent'),
            ]);
            return $this->json($response, 200, [
                'success' => true,
                'message' => 'Заявка успешно отправлена',
                'channels' => [],
                'request_id' => $requestId,
            ]);
        }

        // Подтверждение источника.
        $tokenError = $this->checkToken($data, $requestId, $request);
        if ($tokenError !== null) {
            return $this->json($response, $tokenError['status'], $tokenError['payload']);
        }

        // Капча, если включена на этом сайте. Отказ выносится только по явному вердикту
        // сервиса; его недоступность заявку не отменяет — см. CaptchaVerifier.
        $verdict = $this->captcha->verify(
            Arr::str($data, self::CAPTCHA_FIELD),
            $this->clientIp($request),
            $requestId,
        );
        if (!$verdict['passed']) {
            return $this->json($response, 422, [
                'success' => false,
                'code' => 'CAPTCHA_INVALID',
                'message' => 'Не удалось подтвердить, что вы человек. Обновите страницу и попробуйте снова.',
                'request_id' => $requestId,
            ]);
        }

        // Идемпотентность
        if ($idempotencyKey !== '') {
            $cached = $this->getCachedResponse($idempotencyKey);
            if ($cached !== null) {
                return $this->json($response, $cached['status'], $cached['payload']);
            }
        }

        // Валидация
        $errors = $this->validate($data);
        if ($errors !== []) {
            $payload = [
                'success' => false,
                'code' => 'VALIDATION_ERROR',
                'message' => 'Проверьте поля формы',
                'errors' => $errors,
                'request_id' => $requestId,
            ];
            $this->cacheResponse($idempotencyKey, 422, $payload);
            return $this->json($response, 422, $payload);
        }

        // Последовательная отправка: каналы независимы (падение одного не мешает
        // остальным), но ответ формы ждёт их все — поэтому таймауты каналов держим короткими
        $uploadedFiles = $request->getUploadedFiles();
        $data['_user_agent'] = (string) ($request->getHeaderLine('User-Agent') ?: '');
        $data['_ip'] = $this->clientIp($request);

        $results = $this->dispatcher->dispatch($data, $uploadedFiles, $requestId);
        $channels = [];
        foreach ($results as $result) {
            $channels[$result->channel] = $result->status;
            if ($result->status === ChannelResult::STATUS_FAILED) {
                $this->logger->warning('Канал не доставил', [
                    'channel' => $result->channel,
                    'message' => $result->message,
                    'request_id' => $requestId,
                ]);
            }
        }

        // Итоги остальных каналов уходят в приёмник: без этого «дошло ли до CallTouch на
        // прозвон» не видно нигде — в логи попадают только отказы.
        $this->rescue->reportChannels($channels, $requestId);

        $payload = [
            'success' => true,
            'message' => 'Заявка успешно отправлена',
            'channels' => $channels,
            'request_id' => $requestId,
        ];
        $this->cacheResponse($idempotencyKey, 200, $payload);
        return $this->json($response, 200, $payload);
    }

    private function clientIp(ServerRequestInterface $request): string
    {
        $forwarded = $request->getHeaderLine('X-Forwarded-For');
        if ($forwarded !== '') {
            $first = trim(explode(',', $forwarded)[0]);
            if ($first !== '') {
                return $first;
            }
        }
        $serverParams = $request->getServerParams();
        return (string) ($serverParams['REMOTE_ADDR'] ?? '');
    }

    /**
     * @param array<string,mixed> $data
     * @return array<string,string>
     */
    private function validate(array $data): array
    {
        $errors = [];

        $phoneRaw = Arr::str($data, 'phone');
        $phone = preg_replace('/\D+/', '', $phoneRaw) ?? '';
        if ($phone === '' || strlen($phone) < 7 || strlen($phone) > 15) {
            $errors['phone'] = 'Неверный телефон';
        }

        $policy = Arr::str($data, 'policy');
        if ($policy !== 'on') {
            $errors['policy'] = 'Согласитесь с политикой';
        }

        $email = Arr::str($data, 'email');
        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $errors['email'] = 'Неверный E-mail';
        }

        return $errors;
    }

    /**
     * @param array<string,mixed> $payload
     */
    private function json(ResponseInterface $response, int $status, array $payload): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_UNICODE));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }

    private function pruneIdempotencyStore(): void
    {
        $store = $_SESSION['api_send_idempotency'] ?? [];
        if (!is_array($store)) {
            $_SESSION['api_send_idempotency'] = [];
            return;
        }

        $now = time();
        $ttl = 900;
        foreach ($store as $key => $item) {
            if (!is_array($item) || !isset($item['ts']) || !is_int($item['ts']) || ($now - $item['ts']) > $ttl) {
                unset($store[$key]);
            }
        }
        $_SESSION['api_send_idempotency'] = $store;
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}|null
     */
    private function getCachedResponse(string $idempotencyKey): ?array
    {
        $store = $_SESSION['api_send_idempotency'] ?? [];
        if (!is_array($store) || !isset($store[$idempotencyKey]) || !is_array($store[$idempotencyKey])) {
            return null;
        }

        $entry = $store[$idempotencyKey];
        if (!isset($entry['status'], $entry['payload']) || !is_int($entry['status']) || !is_array($entry['payload'])) {
            return null;
        }

        return ['status' => $entry['status'], 'payload' => $entry['payload']];
    }

    /**
     * @param array<string,mixed> $payload
     */
    private function cacheResponse(string $idempotencyKey, int $status, array $payload): void
    {
        if ($idempotencyKey === '') {
            return;
        }

        $store = $_SESSION['api_send_idempotency'] ?? [];
        if (!is_array($store)) {
            $store = [];
        }

        $store[$idempotencyKey] = ['status' => $status, 'payload' => $payload, 'ts' => time()];
        $_SESSION['api_send_idempotency'] = $store;
    }
}
