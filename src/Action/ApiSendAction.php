<?php

declare(strict_types=1);

namespace App\Action;

use App\Middleware\CorrelationIdMiddleware;
use App\Service\MailService;
use App\Support\Arr;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;

final class ApiSendAction
{
    public function __construct(
        private readonly MailService $mailService,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }

        $this->pruneIdempotencyStore();

        $requestId = (string) $request->getAttribute(CorrelationIdMiddleware::REQUEST_ATTRIBUTE, '');
        $parsed = $request->getParsedBody();
        $data = is_array($parsed) ? $parsed : [];
        $idempotencyKey = Arr::str($data, 'idempotency_key');

        // CSRF
        $csrfToken = Arr::str($data, 'csrf_token');
        $sessionToken = isset($_SESSION['csrf_token']) && is_string($_SESSION['csrf_token']) ? $_SESSION['csrf_token'] : '';

        if ($csrfToken === '' || $sessionToken === '' || !hash_equals($sessionToken, $csrfToken)) {
            return $this->json($response, 419, [
                'success' => false,
                'code' => 'CSRF_INVALID',
                'message' => 'Сессия истекла. Обновите страницу и попробуйте снова.',
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

        // Отправка email
        $uploadedFiles = $request->getUploadedFiles();
        $mailSent = $this->mailService->sendFormSubmission($data, $uploadedFiles, $requestId);

        if (!$mailSent) {
            $this->logger->warning('Форма принята, но письмо не отправлено', ['request_id' => $requestId]);
        }

        $payload = [
            'success' => true,
            'message' => 'Заявка успешно отправлена',
            'request_id' => $requestId,
        ];
        $this->cacheResponse($idempotencyKey, 200, $payload);
        return $this->json($response, 200, $payload);
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
