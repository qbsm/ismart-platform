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
use Throwable;

final class ApiSendAction
{
    /** Имена выбраны правдоподобными: робот заполняет то, что похоже на обычное поле. */
    private const TRAP_FIELD = 'company_site, website';

    /** Имя поля задано самой SmartCaptcha — виджет кладёт ответ именно в него. */
    private const CAPTCHA_FIELD = 'smart-token';

    public function __construct(
        private readonly NotificationDispatcher $dispatcher,
        private readonly LoggerInterface $logger,
        private readonly FormToken $formToken,
        private readonly RescueChannel $rescue,
        private readonly CaptchaVerifier $captcha,
        /** @var array{enable?: bool, trap_field?: string, min_age_sec?: int, required_fields?: string} */
        private readonly array $formGuard = [],
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
        $this->reportRejected($data, 'token:' . $verdict['reason'], $requestId);

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
            // Кука сессии закрыта от скриптов и от чужих сайтов: на ней держится защита формы,
            // а на боевом домене она вдобавок не ходит по открытому HTTP.
            session_set_cookie_params([
                'secure' => getenv('APP_ENV') === 'production',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            session_start(['cache_limiter' => '']);
        }

        $this->pruneIdempotencyStore();

        $requestId = (string) $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');
        $parsed = $request->getParsedBody();
        $data = is_array($parsed) ? $parsed : [];
        $idempotencyKey = Arr::str($data, 'idempotency_key');

        // Служебный прогон (канарейка, сквозной мониторинг): токен и капча обходятся — их
        // у робота нет по построению, а проверяет он остальной путь. Заявка помечается
        // тестовой и едет только в приёмник: каналы заказчика не должны видеть прогоны.
        $isTest = $this->formToken->serviceKeyMatches(
            $request->getHeaderLine('X-Ismart-Key'),
            $request->getUri()->getHost(),
        );

        // Ловушка: поле спрятано от человека, робот заполняет всё подряд. Отвечаем как при
        // успехе — иначе робот подберёт набор полей и вернётся.
        //
        // Выключатель гасит только отказ, но не наблюдение: при разборе жалоб «форма не
        // отправляется» защиту снимают одной переменной и по логу сразу видно, была ли она
        // причиной. Молча переставать замечать роботов нельзя.
        $trapped = '';
        foreach ($this->trapFields() as $field) {
            if (Arr::str($data, $field) !== '') {
                $trapped = $field;
                break;
            }
        }

        if ($trapped !== '') {
            $guardEnabled = (bool) ($this->formGuard['enable'] ?? true);
            $this->logger->warning('Заявка отброшена ловушкой', [
                'request_id' => $requestId,
                'field' => $trapped,
                'ip' => $this->clientIp($request),
                'user_agent' => $request->getHeaderLine('User-Agent'),
                'guard_enabled' => $guardEnabled,
            ]);
            if ($guardEnabled) {
                $this->reportRejected($data, 'trap:' . $trapped, $requestId);
                return $this->json($response, 200, [
                    'success' => true,
                    'message' => 'Заявка успешно отправлена',
                    'channels' => [],
                    'request_id' => $requestId,
                ]);
            }
            // Отсев выключен — заявка едет дальше, но пометка о сработавшей ловушке
            // остаётся: без неё включать отсев обратно пришлось бы вслепую.
            $data['guard_observed'] = 'trap:' . $trapped;
        }

        // Подтверждение источника.
        if (!$isTest) {
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
                $this->reportRejected($data, 'captcha', $requestId);
                return $this->json($response, 422, [
                    'success' => false,
                    'code' => 'CAPTCHA_INVALID',
                    'message' => 'Не удалось подтвердить, что вы человек. Обновите страницу и попробуйте снова.',
                    'request_id' => $requestId,
                ]);
            }
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
            // Ошибку валидации не кэшируем: ключ идемпотентности живёт весь сеанс формы,
            // и исправленные поля должны проверяться заново, а не получать старый отказ.
            return $this->json($response, 422, $payload);
        }

        // Последовательная отправка: каналы независимы (падение одного не мешает
        // остальным), но ответ формы ждёт их все — поэтому таймауты каналов держим короткими
        $uploadedFiles = $request->getUploadedFiles();
        $data['_user_agent'] = (string) ($request->getHeaderLine('User-Agent') ?: '');
        $data['_ip'] = $this->clientIp($request);

        // Сессия CallTouch живёт в куке браузера. Сам канал её оттуда и берёт, но остальным
        // получателям заявки она не видна — без неё лид не сшивается с визитом в кабинете.
        $ctSession = (string) ($request->getCookieParams()['_ct_session_id'] ?? '');
        if ($ctSession !== '' && Arr::str($data, 'session_id') === '') {
            $data['session_id'] = $ctSession;
        }

        if ($isTest) {
            $data['is_test'] = '1';
            $results = [$this->sendTestToRescue($data, $uploadedFiles, $requestId)];
        } else {
            $results = $this->dispatcher->dispatch($data, $uploadedFiles, $requestId);
        }
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
        //
        // Выключенные каналы не отправляем: их не звали, и в статусах они только шум —
        // строка «calltouch: успешно» читается, а та же строка среди четырёх «выключен» нет.
        if (!$isTest) {
            $reported = array_filter(
                $channels,
                static fn (string $status): bool => $status !== ChannelResult::STATUS_DISABLED,
            );
            // Тот же ключ, что у заявки в приёмнике: итоги каналов ищут её по нему.
            $this->rescue->reportChannels($reported, $idempotencyKey !== '' ? $idempotencyKey : $requestId);
        }

        // Посетителю ошибка нужна, только если заявка не ушла НИ В ОДИН канал: отказ
        // отдельного канала он всё равно не исправит, а лид уже сохранён и его наберут.
        // Разбор отказов — на нас: они видны в логе выше, в статусах каналов и в мониторинге.
        //
        // Выключенный канал доставкой не считается: он ничего не принял. Иначе площадка с
        // одним включённым каналом отвечала бы «отправлено» и при его отказе — заявка теряется
        // молча, а это ровно то, ради чего проверка и заведена.
        $attempted = array_filter(
            $results,
            static fn (ChannelResult $r): bool => $r->status !== ChannelResult::STATUS_DISABLED,
        );

        $delivered = false;
        foreach ($attempted as $result) {
            if ($result->status !== ChannelResult::STATUS_FAILED) {
                $delivered = true;
                break;
            }
        }

        if (!$delivered && $attempted !== []) {
            $this->logger->error('Заявка не ушла ни в один канал', [
                'request_id' => $requestId,
                'channels' => $channels,
            ]);
            $payload = [
                'success' => false,
                'code' => 'DELIVERY_FAILED',
                'message' => 'Не получилось отправить заявку. Позвоните нам или попробуйте позже.',
                'channels' => $channels,
                'request_id' => $requestId,
            ];
            if ($isTest) {
                $payload['test'] = true;
            }
            // Неуспех не кэшируем: повтор должен пойти в каналы заново.
            return $this->json($response, 502, $payload);
        }

        $payload = [
            'success' => true,
            'message' => 'Заявка успешно отправлена',
            'channels' => $channels,
            'request_id' => $requestId,
        ];
        if ($isTest) {
            $payload['test'] = true;
        }
        $this->cacheResponse($idempotencyKey, 200, $payload);
        return $this->json($response, 200, $payload);
    }

    /**
     * Отсев уходит в приёмник с причиной: жалоба «я отправлял, а вы не позвонили»
     * разбирается поиском по номеру на служебном листе, а не по логам площадки.
     * Неудача отправки сам отсев не меняет — решение уже принято.
     */
    private function reportRejected(array $data, string $reason, string $requestId): void
    {
        if (!$this->rescue->isEnabled()) {
            return;
        }
        $data['rejected'] = $reason;
        try {
            $this->rescue->send($data, [], $requestId);
        } catch (Throwable $e) {
            $this->logger->warning('Отсев не доехал до приёмника', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Тестовая заявка едет только в приёмник: канал зовётся напрямую, минуя диспетчер,
     * чтобы почта/CallTouch/телеграм заказчика даже не перебирались.
     */
    private function sendTestToRescue(array $data, array $uploadedFiles, string $requestId): ChannelResult
    {
        if (!$this->rescue->isEnabled()) {
            return ChannelResult::disabled($this->rescue->name());
        }

        try {
            return $this->rescue->send($data, $uploadedFiles, $requestId);
        } catch (Throwable $e) {
            $this->logger->error('Rescue не принял тестовую заявку', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->rescue->name(), $e->getMessage());
        }
    }

    /** @return list<string> */
    private function trapFields(): array
    {
        $raw = (string) ($this->formGuard['trap_field'] ?? self::TRAP_FIELD);
        $fields = array_filter(array_map('trim', explode(',', $raw)), static fn (string $f): bool => $f !== '');

        return array_values($fields !== [] ? $fields : ['company_site']);
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
        $required = $this->requiredFields();

        // Набор обязательных полей — свойство площадки, а не ядра: форма подписки живёт
        // без телефона, форма звонка — без почты. Незаполненное необязательное не ошибка,
        // но заполненное проверяется всегда.
        $phone = preg_replace('/\D+/', '', Arr::str($data, 'phone')) ?? '';
        $phoneBad = $phone === '' || strlen($phone) < 7 || strlen($phone) > 15;
        if ($phoneBad && (in_array('phone', $required, true) || $phone !== '')) {
            $errors['phone'] = 'Неверный телефон';
        }

        $policy = Arr::str($data, 'policy');
        if ($policy !== 'on') {
            $errors['policy'] = 'Согласитесь с политикой';
        }

        $email = Arr::str($data, 'email');
        $emailBad = $email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false;
        if ($emailBad && (in_array('email', $required, true) || $email !== '')) {
            $errors['email'] = 'Неверный E-mail';
        }

        if (in_array('name', $required, true) && mb_strlen(trim(Arr::str($data, 'name'))) < 2) {
            $errors['name'] = 'Укажите имя';
        }

        return $errors;
    }

    /** @return list<string> */
    private function requiredFields(): array
    {
        $raw = (string) ($this->formGuard['required_fields'] ?? 'phone');
        $fields = array_values(array_filter(array_map('trim', explode(',', $raw))));

        return $fields !== [] ? $fields : ['phone'];
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
