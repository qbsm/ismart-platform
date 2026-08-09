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
    ) {}

    public function name(): string
    {
        return 'mail';
    }

    /**
     * Флаг решает, если задан явно; иначе канал включён при наличии адреса — так он вёл себя
     * до появления `MAIL_ENABLE`, и молча выключать почту на deployment'ах, где флага ещё нет,
     * нельзя: это тихо оставило бы клиента без заявок.
     */
    public function isEnabled(): bool
    {
        $flag = (string) ($this->config['enable'] ?? '');

        if ($flag !== '') {
            return filter_var($flag, FILTER_VALIDATE_BOOL) === true
                && (string) ($this->config['to'] ?? '') !== '';
        }

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
