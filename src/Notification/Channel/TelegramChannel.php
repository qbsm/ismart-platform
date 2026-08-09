<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\Multipart\FormDataPart;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Throwable;

final class TelegramChannel implements ChannelInterface
{
    private const API_BASE = 'https://api.telegram.org';

    private const FIELD_LABELS = [
        'name' => 'Имя',
        'phone' => 'Телефон',
        'email' => 'Email',
        'message' => 'Сообщение',
    ];

    private const SKIP_FIELDS = [
        'csrf_token',
        'form_token',
        'company_site',
        'idempotency_key',
        'policy',
        'session_id',
        'sessionId',
    ];

    /**
     * @param array{enable?: bool, bot_token?: string, chat_id?: string, timeout?: int} $config
     */
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly array $config,
    ) {}

    public function name(): string
    {
        return 'telegram';
    }

    public function isEnabled(): bool
    {
        return ($this->config['enable'] ?? false) === true
            && (string) ($this->config['bot_token'] ?? '') !== ''
            && (string) ($this->config['chat_id'] ?? '') !== '';
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        $text = $this->formatMessage($formData, $requestId);

        $messageResult = $this->sendMessage($text, $requestId);
        if (!is_array($messageResult)) {
            return $messageResult;
        }
        $messageId = $messageResult['message_id'];

        $files = $this->collectUploadedFiles($uploadedFiles);
        $failed = [];
        $sent = 0;

        foreach ($files as $file) {
            try {
                $this->sendDocument($file, $requestId);
                $sent++;
            } catch (Throwable $e) {
                $failed[] = [
                    'name' => $file['name'],
                    'error' => $e->getMessage(),
                ];
                $this->logger->warning('Telegram: sendDocument failed', [
                    'request_id' => $requestId,
                    'file' => $file['name'],
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $meta = [
            'message_id' => $messageId,
            'attached_files' => $sent,
        ];

        if ($failed !== []) {
            $meta['failed_files'] = $failed;
            return ChannelResult::warning($this->name(), 'partial_files_failed', $meta);
        }

        return ChannelResult::success($this->name(), $meta);
    }

    /**
     * @return array{message_id:int}|ChannelResult
     */
    private function sendMessage(string $text, string $requestId): array|ChannelResult
    {
        $timeout = (float) ($this->config['timeout'] ?? 10);
        $url = self::API_BASE . '/bot' . ($this->config['bot_token'] ?? '') . '/sendMessage';

        try {
            $response = $this->httpClient->request('POST', $url, [
                'json' => [
                    'chat_id' => (string) ($this->config['chat_id'] ?? ''),
                    'text' => $text,
                    'parse_mode' => 'HTML',
                    'disable_web_page_preview' => true,
                ],
                'timeout' => $timeout,
                'max_duration' => $timeout,
            ]);
            $httpCode = $response->getStatusCode();
            $decoded = $response->toArray(false);
        } catch (TransportException $e) {
            $this->logger->error('Telegram: transport error', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        } catch (ExceptionInterface $e) {
            $this->logger->error('Telegram: http client error', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        }

        if ($httpCode === 200 && ($decoded['ok'] ?? false) === true && isset($decoded['result']['message_id'])) {
            $messageId = (int) $decoded['result']['message_id'];
            $this->logger->info('Telegram: заявка отправлена', [
                'request_id' => $requestId,
                'message_id' => $messageId,
            ]);
            return ['message_id' => $messageId];
        }

        $description = (string) ($decoded['description'] ?? 'unknown_error');
        $this->logger->error('Telegram: sendMessage failed', [
            'request_id' => $requestId,
            'http_code' => $httpCode,
            'description' => $description,
        ]);

        return ChannelResult::failed($this->name(), $description, ['http_code' => $httpCode]);
    }

    /**
     * @param array{name:string, contents:string, mime:string} $file
     */
    private function sendDocument(array $file, string $requestId): void
    {
        $timeout = (float) ($this->config['timeout'] ?? 10);
        $url = self::API_BASE . '/bot' . ($this->config['bot_token'] ?? '') . '/sendDocument';

        $form = new FormDataPart([
            'chat_id' => (string) ($this->config['chat_id'] ?? ''),
            'document' => new DataPart($file['contents'], $file['name'], $file['mime'] ?: 'application/octet-stream'),
        ]);

        $response = $this->httpClient->request('POST', $url, [
            'headers' => $form->getPreparedHeaders()->toArray(),
            'body' => $form->bodyToIterable(),
            'timeout' => $timeout,
            'max_duration' => $timeout,
        ]);

        $httpCode = $response->getStatusCode();
        $decoded = $response->toArray(false);

        if ($httpCode !== 200 || ($decoded['ok'] ?? false) !== true) {
            $description = (string) ($decoded['description'] ?? "http_$httpCode");
            throw new \RuntimeException($description);
        }

        $this->logger->info('Telegram: документ отправлен', [
            'request_id' => $requestId,
            'file' => $file['name'],
        ]);
    }

    /**
     * @param array<string,mixed> $formData
     */
    private function formatMessage(array $formData, string $requestId): string
    {
        $lines = ['<b>Новая заявка</b>', ''];

        foreach (self::FIELD_LABELS as $key => $label) {
            $value = (string) ($formData[$key] ?? '');
            if ($value === '') {
                continue;
            }
            $lines[] = '<b>' . htmlspecialchars($label, ENT_QUOTES | ENT_HTML5, 'UTF-8')
                . ':</b> ' . htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        $extra = [];
        foreach ($formData as $key => $value) {
            if (
                isset(self::FIELD_LABELS[$key])
                || in_array($key, self::SKIP_FIELDS, true)
                || !is_scalar($value)
                || (string) $value === ''
            ) {
                continue;
            }
            $extra[$key] = (string) $value;
        }

        if ($extra !== []) {
            $lines[] = '';
            $lines[] = '<b>Дополнительно:</b>';
            foreach ($extra as $key => $value) {
                $lines[] = '— ' . htmlspecialchars($key, ENT_QUOTES | ENT_HTML5, 'UTF-8')
                    . ': ' . htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }

        $lines[] = '';
        $lines[] = '<i>request_id: ' . htmlspecialchars($requestId, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</i>';

        return implode("\n", $lines);
    }

    /**
     * @param array<string,mixed> $uploadedFiles
     * @return array<int, array{name:string, contents:string, mime:string}>
     */
    private function collectUploadedFiles(array $uploadedFiles): array
    {
        $result = [];
        $this->flattenUploadedFiles($uploadedFiles, $result);
        return $result;
    }

    /**
     * @param array<string,mixed>|UploadedFileInterface $node
     * @param array<int, array{name:string, contents:string, mime:string}> $out
     */
    private function flattenUploadedFiles($node, array &$out): void
    {
        if ($node instanceof UploadedFileInterface) {
            if ($node->getError() !== UPLOAD_ERR_OK) {
                return;
            }
            $name = (string) ($node->getClientFilename() ?? 'file');
            $mime = (string) ($node->getClientMediaType() ?? 'application/octet-stream');
            $contents = (string) $node->getStream();
            $out[] = ['name' => $name, 'contents' => $contents, 'mime' => $mime];
            return;
        }

        foreach ($node as $child) {
            $this->flattenUploadedFiles($child, $out);
        }
    }
}
