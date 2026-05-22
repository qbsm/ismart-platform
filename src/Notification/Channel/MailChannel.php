<?php

declare(strict_types=1);

namespace App\Notification\Channel;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use App\Service\MailService;

final class MailChannel implements ChannelInterface
{
    /**
     * @param array{to?: string} $config Секция settings['mail']
     */
    public function __construct(
        private readonly MailService $mailService,
        private readonly array $config = [],
    ) {
    }

    public function name(): string
    {
        return 'mail';
    }

    public function isEnabled(): bool
    {
        return (string) ($this->config['to'] ?? '') !== '';
    }

    public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
    {
        $ok = $this->mailService->sendFormSubmission($formData, $uploadedFiles, $requestId);

        return $ok
            ? ChannelResult::success($this->name())
            : ChannelResult::failed($this->name(), 'mail_transport_failed');
    }
}
