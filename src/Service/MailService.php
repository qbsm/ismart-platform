<?php

declare(strict_types=1);

namespace App\Service;

use App\Support\Arr;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class MailService
{
    /** @var array<string,string> */
    private const FIELD_LABELS = [
        'name' => 'Имя',
        'phone' => 'Телефон',
        'email' => 'E-mail',
        'square' => 'Площадь',
        'message' => 'Сообщение',
        'company' => 'Компания',
        'city' => 'Город',
    ];

    /** @var string[] */
    private const SKIP_FIELDS = ['csrf_token', 'current_url', 'policy', 'lang', 'idempotency_key'];

    /**
     * @param array{
     *     to: string,
     *     from: string,
     *     from_name: string,
     *     subject_prefix: string
     * } $config
     */
    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly LoggerInterface $logger,
        private readonly array $config,
    ) {
    }

    /**
     * @param array<string,mixed>  $formData     POST-данные формы
     * @param array<string,mixed>  $uploadedFiles PSR-7 uploaded files
     */
    public function sendFormSubmission(
        array $formData,
        array $uploadedFiles = [],
        string $requestId = '',
    ): bool {
        $to = $this->config['to'];
        if ($to === '') {
            $this->logger->warning('MAIL_TO не задан, письмо не отправлено', ['request_id' => $requestId]);
            return false;
        }
        $recipients = array_values(array_filter(array_map('trim', explode(',', $to)), static fn (string $a): bool => $a !== ''));
        if ($recipients === []) {
            $this->logger->warning('MAIL_TO не задан, письмо не отправлено', ['request_id' => $requestId]);
            return false;
        }

        $currentUrl = Arr::str($formData, 'current_url');
        $pagePath = $currentUrl !== '' ? (parse_url($currentUrl, PHP_URL_PATH) ?: '/') : '/';
        $subject = trim($this->config['subject_prefix'] . ' Заявка с сайта — ' . $pagePath);

        $textBody = $this->buildTextBody($formData, $uploadedFiles, $currentUrl, $requestId);
        $htmlBody = $this->buildHtmlBody($formData, $uploadedFiles, $currentUrl, $requestId);

        $from = $this->config['from_name'] !== ''
            ? new Address($this->config['from'], $this->config['from_name'])
            : new Address($this->config['from']);

        $email = (new Email())
            ->from($from)
            ->to(...$recipients)
            ->subject($subject)
            ->text($textBody)
            ->html($htmlBody);

        // Reply-To: email клиента, если есть
        $clientEmail = Arr::str($formData, 'email');
        if ($clientEmail !== '' && filter_var($clientEmail, FILTER_VALIDATE_EMAIL) !== false) {
            $clientName = Arr::str($formData, 'name');
            $email->replyTo($clientName !== '' ? new Address($clientEmail, $clientName) : new Address($clientEmail));
        }

        // Вложения
        $this->attachFiles($email, $uploadedFiles);

        try {
            $this->mailer->send($email);
            $this->logger->info('Письмо отправлено', ['to' => $to, 'request_id' => $requestId]);
            return true;
        } catch (TransportExceptionInterface $e) {
            $this->logger->error('Ошибка отправки письма', [
                'to' => $to,
                'request_id' => $requestId,
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * @param array<string,mixed> $formData
     * @param array<string,mixed> $uploadedFiles
     */
    private function buildTextBody(array $formData, array $uploadedFiles, string $currentUrl, string $requestId): string
    {
        $lines = ['Новая заявка с сайта', str_repeat('—', 40), ''];

        foreach ($formData as $key => $value) {
            if (in_array($key, self::SKIP_FIELDS, true) || !is_string($value)) {
                continue;
            }
            $lines[] = $this->fieldLabel($key) . ': ' . $this->formatValue($key, $value);
        }

        $fileNames = $this->collectFileNames($uploadedFiles);
        if ($fileNames !== []) {
            $lines[] = '';
            $lines[] = 'Прикреплённые файлы (' . count($fileNames) . '):';
            foreach ($fileNames as $name) {
                $lines[] = '  • ' . $name;
            }
        }

        $lines[] = '';
        $lines[] = str_repeat('—', 40);
        $lines[] = 'Страница: ' . $currentUrl;
        $lines[] = 'Время: ' . date('d.m.Y H:i:s');
        $lines[] = 'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        if ($requestId !== '') {
            $lines[] = 'Request ID: ' . $requestId;
        }

        return implode("\r\n", $lines);
    }

    /**
     * @param array<string,mixed> $formData
     * @param array<string,mixed> $uploadedFiles
     */
    private function buildHtmlBody(array $formData, array $uploadedFiles, string $currentUrl, string $requestId): string
    {
        $rows = '';
        foreach ($formData as $key => $value) {
            if (in_array($key, self::SKIP_FIELDS, true) || !is_string($value)) {
                continue;
            }
            $label = htmlspecialchars($this->fieldLabel($key), ENT_QUOTES, 'UTF-8');
            $val = htmlspecialchars($this->formatValue($key, $value), ENT_QUOTES, 'UTF-8');
            $rows .= "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #eee;color:#666;white-space:nowrap;vertical-align:top\">{$label}</td>"
                . "<td style=\"padding:8px 12px;border-bottom:1px solid #eee\">{$val}</td></tr>";
        }

        $fileNames = $this->collectFileNames($uploadedFiles);
        $filesHtml = '';
        if ($fileNames !== []) {
            $filesHtml = '<p style="margin:16px 0 8px;color:#666">Прикреплённые файлы:</p><ul style="margin:0;padding-left:20px">';
            foreach ($fileNames as $name) {
                $filesHtml .= '<li>' . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . '</li>';
            }
            $filesHtml .= '</ul>';
        }

        $pageHtml = htmlspecialchars($currentUrl, ENT_QUOTES, 'UTF-8');
        $time = date('d.m.Y H:i:s');
        $ip = htmlspecialchars($_SERVER['REMOTE_ADDR'] ?? 'unknown', ENT_QUOTES, 'UTF-8');

        return <<<HTML
        <!DOCTYPE html>
        <html lang="ru">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333">
        <div style="max-width:600px;margin:20px auto;background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
          <div style="background:#4a4a49;color:#fff;padding:16px 24px;font-size:16px;font-weight:600">Новая заявка с сайта</div>
          <div style="padding:24px">
            <table style="width:100%;border-collapse:collapse">{$rows}</table>
            {$filesHtml}
          </div>
          <div style="padding:12px 24px;background:#f9f9f9;font-size:12px;color:#999;border-top:1px solid #eee">
            Страница: <a href="{$pageHtml}" style="color:#999">{$pageHtml}</a><br>
            {$time} &middot; IP: {$ip}{$this->requestIdHtml($requestId)}
          </div>
        </div>
        </body>
        </html>
        HTML;
    }

    private function requestIdHtml(string $requestId): string
    {
        if ($requestId === '') {
            return '';
        }
        return ' &middot; ID: ' . htmlspecialchars($requestId, ENT_QUOTES, 'UTF-8');
    }

    /**
     * @param array<string,mixed> $uploadedFiles
     */
    private function attachFiles(Email $email, array $uploadedFiles): void
    {
        foreach ($uploadedFiles as $fileOrArray) {
            $files = is_array($fileOrArray) ? $fileOrArray : [$fileOrArray];
            foreach ($files as $file) {
                if (!$file instanceof UploadedFileInterface || $file->getError() !== UPLOAD_ERR_OK) {
                    continue;
                }
                $stream = $file->getStream();
                $stream->rewind();
                $content = $stream->getContents();
                $filename = $file->getClientFilename() ?? 'file';
                $mimeType = $file->getClientMediaType() ?? 'application/octet-stream';

                $email->attach($content, $filename, $mimeType);
            }
        }
    }

    /**
     * @param array<string,mixed> $uploadedFiles
     * @return string[]
     */
    private function collectFileNames(array $uploadedFiles): array
    {
        $names = [];
        foreach ($uploadedFiles as $fileOrArray) {
            $files = is_array($fileOrArray) ? $fileOrArray : [$fileOrArray];
            foreach ($files as $file) {
                if ($file instanceof UploadedFileInterface && $file->getError() === UPLOAD_ERR_OK) {
                    $name = $file->getClientFilename() ?? 'file';
                    $sizeMb = round($file->getSize() / 1048576, 1);
                    $names[] = "{$name} ({$sizeMb} МБ)";
                }
            }
        }
        return $names;
    }

    private function fieldLabel(string $key): string
    {
        return self::FIELD_LABELS[$key] ?? ucfirst(str_replace('_', ' ', $key));
    }

    private function formatValue(string $key, string $value): string
    {
        if ($key === 'phone' && $value !== '' && $value[0] !== '+' && ctype_digit($value)) {
            return '+' . $value;
        }
        return $value;
    }

}
