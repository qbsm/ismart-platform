<?php

declare(strict_types=1);

namespace App\Tests\Unit\Notification;

use App\Notification\Channel\MailChannel;
use App\Service\MailService;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\Mailer\MailerInterface;

final class MailChannelTest extends TestCase
{
    private function channel(array $config): MailChannel
    {
        // MailService объявлен final и не подменяется дублем; отправка в этих проверках не
        // происходит — важно только решение isEnabled().
        $mailService = new MailService($this->createStub(MailerInterface::class), new NullLogger(), $config);

        return new MailChannel($mailService, $config);
    }

    public function testEnabledByAddressWhenFlagAbsent(): void
    {
        self::assertTrue($this->channel(['to' => 'sales@example.com'])->isEnabled());
    }

    public function testDisabledWithoutAddress(): void
    {
        self::assertFalse($this->channel(['to' => ''])->isEnabled());
    }

    public function testFlagTurnsChannelOffWithAddressInPlace(): void
    {
        self::assertFalse($this->channel(['enable' => 'false', 'to' => 'sales@example.com'])->isEnabled());
        self::assertFalse($this->channel(['enable' => '0', 'to' => 'sales@example.com'])->isEnabled());
    }

    public function testFlagOnRequiresAddressAnyway(): void
    {
        self::assertTrue($this->channel(['enable' => 'true', 'to' => 'sales@example.com'])->isEnabled());
        self::assertFalse($this->channel(['enable' => 'true', 'to' => ''])->isEnabled());
    }

    /**
     * Пустая строка означает «переменной в .env нет», а не «выключено»: иначе выкладка нового
     * ядра тихо оставила бы без писем те deployment'ы, где флаг ещё не прописан.
     */
    public function testEmptyFlagKeepsPreviousBehaviour(): void
    {
        self::assertTrue($this->channel(['enable' => '', 'to' => 'sales@example.com'])->isEnabled());
    }
}
