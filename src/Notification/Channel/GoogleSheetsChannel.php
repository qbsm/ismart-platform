<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use Psr\Log\LoggerInterface;
use RuntimeException;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Throwable;

final class GoogleSheetsChannel implements ChannelInterface
{
    private const OAUTH_URL = 'https://oauth2.googleapis.com/token';
    private const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
    private const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

    private const COLUMNS = [
        'timestamp', 'request_id', 'name', 'phone', 'email', 'message',
        'form_id', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign',
        'utm_content', 'utm_term', 'user_agent', 'ip',
    ];

    private const HEADER_RU = [
        'Время', 'Request ID', 'Имя', 'Телефон', 'Email', 'Сообщение',
        'Форма', 'Страница', 'utm_source', 'utm_medium', 'utm_campaign',
        'utm_content', 'utm_term', 'User-Agent', 'IP',
    ];

    private const RANGE_HEADER = 'A1:O1';
    private const RANGE_APPEND = 'A:O';

    /**
     * @param array{
     *     enable?: bool,
     *     spreadsheet_id?: string,
     *     sheet_name?: string,
     *     credentials_path?: string,
     *     timeout?: int,
     * } $config
     */
    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
        private readonly array $config,
        private readonly string $projectRoot,
    ) {}

    public function name(): string
    {
        return 'google_sheets';
    }

    public function isEnabled(): bool
    {
        if (($this->config['enable'] ?? false) !== true) {
            return false;
        }
        if ((string) ($this->config['spreadsheet_id'] ?? '') === '') {
            return false;
        }
        $credsPath = $this->resolveCredentialsPath();
        return $credsPath !== null && is_readable($credsPath);
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        try {
            $accessToken = $this->getAccessToken();
        } catch (Throwable $e) {
            $this->logger->error('GoogleSheets: auth failed', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), 'auth_failed: ' . $e->getMessage());
        }

        try {
            $this->ensureHeader($accessToken);
        } catch (Throwable $e) {
            $this->logger->warning('GoogleSheets: ensureHeader failed', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
        }

        try {
            $row = $this->buildRow($formData, $requestId);
            $updatedRange = $this->appendRow($accessToken, $row);
            $this->logger->info('GoogleSheets: строка добавлена', [
                'request_id' => $requestId,
                'updated_range' => $updatedRange,
            ]);
            return ChannelResult::success($this->name(), ['updated_range' => $updatedRange]);
        } catch (Throwable $e) {
            $this->logger->error('GoogleSheets: append failed', [
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return ChannelResult::failed($this->name(), $e->getMessage());
        }
    }

    /**
     * @return array<int,string>
     */
    private function buildRow(array $formData, string $requestId): array
    {
        $aliases = [
            'page_url' => ['page_url', 'current_url'],
            'user_agent' => ['_user_agent', 'user_agent'],
            'ip' => ['_ip', 'ip'],
        ];

        $row = [];
        foreach (self::COLUMNS as $col) {
            if ($col === 'timestamp') {
                $row[] = date('c');
                continue;
            }
            if ($col === 'request_id') {
                $row[] = $requestId;
                continue;
            }
            $keys = $aliases[$col] ?? [$col];
            $value = '';
            foreach ($keys as $key) {
                if (isset($formData[$key]) && is_scalar($formData[$key]) && (string) $formData[$key] !== '') {
                    $value = (string) $formData[$key];
                    break;
                }
            }
            $row[] = $value;
        }
        return $row;
    }

    private function ensureHeader(string $accessToken): void
    {
        $flagPath = $this->headerFlagPath();
        if (is_file($flagPath)) {
            return;
        }

        $sheetName = (string) ($this->config['sheet_name'] ?? 'Заявки');
        $range = rawurlencode($sheetName . '!' . self::RANGE_HEADER);
        $url = self::SHEETS_API . '/' . rawurlencode((string) $this->config['spreadsheet_id']) . '/values/' . $range;

        $response = $this->httpClient->request('GET', $url, [
            'headers' => ['Authorization' => 'Bearer ' . $accessToken],
            'timeout' => (float) ($this->config['timeout'] ?? 10),
        ]);

        $data = $response->toArray(false);
        $existing = $data['values'][0] ?? null;
        if (is_array($existing) && $existing !== []) {
            $this->touchFlag($flagPath);
            return;
        }

        $writeUrl = self::SHEETS_API . '/' . rawurlencode((string) $this->config['spreadsheet_id'])
            . '/values/' . $range . '?valueInputOption=RAW';

        $this->httpClient->request('PUT', $writeUrl, [
            'headers' => [
                'Authorization' => 'Bearer ' . $accessToken,
                'Content-Type' => 'application/json',
            ],
            'json' => ['values' => [self::HEADER_RU]],
            'timeout' => (float) ($this->config['timeout'] ?? 10),
        ])->getStatusCode();

        $this->touchFlag($flagPath);
    }

    /**
     * @param array<int,string> $row
     * @return string range вида "Заявки!A2:O2"
     */
    private function appendRow(string $accessToken, array $row): string
    {
        $sheetName = (string) ($this->config['sheet_name'] ?? 'Заявки');
        $range = rawurlencode($sheetName . '!' . self::RANGE_APPEND);
        $url = self::SHEETS_API . '/' . rawurlencode((string) $this->config['spreadsheet_id'])
            . '/values/' . $range
            . ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';

        $response = $this->httpClient->request('POST', $url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $accessToken,
                'Content-Type' => 'application/json',
            ],
            'json' => ['values' => [$row]],
            'timeout' => (float) ($this->config['timeout'] ?? 10),
        ]);

        $code = $response->getStatusCode();
        $data = $response->toArray(false);

        if ($code !== 200 || !isset($data['updates']['updatedRange'])) {
            $message = (string) ($data['error']['message'] ?? "http_$code");
            throw new RuntimeException($message);
        }

        return (string) $data['updates']['updatedRange'];
    }

    private function getAccessToken(): string
    {
        $cached = $this->readTokenCache();
        if ($cached !== null) {
            return $cached;
        }

        $creds = $this->loadCredentials();
        $jwt = $this->signJwt($creds['client_email'], $creds['private_key']);

        try {
            $response = $this->httpClient->request('POST', self::OAUTH_URL, [
                'body' => [
                    'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    'assertion' => $jwt,
                ],
                'timeout' => (float) ($this->config['timeout'] ?? 10),
            ]);
            $code = $response->getStatusCode();
            $data = $response->toArray(false);
        } catch (TransportException|ExceptionInterface $e) {
            throw new RuntimeException('oauth_transport: ' . $e->getMessage());
        }

        if ($code !== 200 || !isset($data['access_token'])) {
            $message = (string) ($data['error_description'] ?? $data['error'] ?? "http_$code");
            throw new RuntimeException('oauth_failed: ' . $message);
        }

        $token = (string) $data['access_token'];
        $expiresIn = (int) ($data['expires_in'] ?? 3600);
        $this->writeTokenCache($token, $expiresIn);

        return $token;
    }

    /**
     * @return array{client_email:string, private_key:string}
     */
    private function loadCredentials(): array
    {
        $path = $this->resolveCredentialsPath();
        if ($path === null || !is_readable($path)) {
            throw new RuntimeException('credentials_not_found');
        }
        $raw = (string) file_get_contents($path);
        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['client_email'], $data['private_key'])) {
            throw new RuntimeException('credentials_invalid');
        }
        return [
            'client_email' => (string) $data['client_email'],
            'private_key' => (string) $data['private_key'],
        ];
    }

    private function signJwt(string $clientEmail, string $privateKeyPem): string
    {
        $now = time();
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $payload = [
            'iss' => $clientEmail,
            'scope' => self::SCOPE,
            'aud' => self::OAUTH_URL,
            'iat' => $now,
            'exp' => $now + 3600,
        ];

        $segments = [
            self::base64UrlEncode((string) json_encode($header)),
            self::base64UrlEncode((string) json_encode($payload)),
        ];
        $signingInput = implode('.', $segments);

        $privateKey = openssl_pkey_get_private($privateKeyPem);
        if ($privateKey === false) {
            throw new RuntimeException('invalid_private_key');
        }

        $signature = '';
        $signed = openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (!$signed) {
            throw new RuntimeException('jwt_sign_failed');
        }

        return $signingInput . '.' . self::base64UrlEncode($signature);
    }

    private function readTokenCache(): ?string
    {
        $path = $this->tokenCachePath();
        if (!is_file($path)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data) || !isset($data['access_token'], $data['expires_at'])) {
            return null;
        }
        if ((int) $data['expires_at'] <= time()) {
            return null;
        }
        return (string) $data['access_token'];
    }

    private function writeTokenCache(string $token, int $expiresIn): void
    {
        $path = $this->tokenCachePath();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0o775, true);
        }
        $payload = json_encode([
            'access_token' => $token,
            'expires_at' => time() + $expiresIn - 60,
        ]);
        @file_put_contents($path, (string) $payload, LOCK_EX);
        @chmod($path, 0o600);
    }

    private function tokenCachePath(): string
    {
        return $this->projectRoot . '/cache/google-sheets/token.json';
    }

    private function headerFlagPath(): string
    {
        $hash = substr(hash('sha256', (string) ($this->config['spreadsheet_id'] ?? '')), 0, 16);
        return $this->projectRoot . '/cache/google-sheets/header-' . $hash . '.flag';
    }

    private function touchFlag(string $path): void
    {
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0o775, true);
        }
        @touch($path);
    }

    private function resolveCredentialsPath(): ?string
    {
        $configured = (string) ($this->config['credentials_path'] ?? '');
        if ($configured === '') {
            return null;
        }
        $absolute = str_starts_with($configured, '/')
            ? $configured
            : $this->projectRoot . '/' . ltrim($configured, '/');
        return $absolute;
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
