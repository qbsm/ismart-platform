<?php

declare(strict_types=1);

namespace App\Tests\Unit\Notification;

use App\Notification\ChannelResult;
use PHPUnit\Framework\TestCase;

final class ChannelResultTest extends TestCase
{
    public function testSuccessFactory(): void
    {
        $result = ChannelResult::success('mail', ['message_id' => 42]);

        self::assertSame('mail', $result->channel);
        self::assertSame(ChannelResult::STATUS_SUCCESS, $result->status);
        self::assertSame('', $result->message);
        self::assertSame(['message_id' => 42], $result->meta);
        self::assertTrue($result->isSuccess());
    }

    public function testWarningFactory(): void
    {
        $result = ChannelResult::warning('calltouch', 'empty_phone', ['http_code' => 400]);

        self::assertSame('calltouch', $result->channel);
        self::assertSame(ChannelResult::STATUS_WARNING, $result->status);
        self::assertSame('empty_phone', $result->message);
        self::assertSame(['http_code' => 400], $result->meta);
        self::assertFalse($result->isSuccess());
    }

    public function testFailedFactory(): void
    {
        $result = ChannelResult::failed('telegram', 'transport_error');

        self::assertSame('telegram', $result->channel);
        self::assertSame(ChannelResult::STATUS_FAILED, $result->status);
        self::assertSame('transport_error', $result->message);
        self::assertSame([], $result->meta);
        self::assertFalse($result->isSuccess());
    }

    public function testDisabledFactory(): void
    {
        $result = ChannelResult::disabled('google_sheets');

        self::assertSame('google_sheets', $result->channel);
        self::assertSame(ChannelResult::STATUS_DISABLED, $result->status);
        self::assertSame('', $result->message);
        self::assertSame([], $result->meta);
        self::assertFalse($result->isSuccess());
    }

    public function testStatusConstants(): void
    {
        self::assertSame('success', ChannelResult::STATUS_SUCCESS);
        self::assertSame('warning', ChannelResult::STATUS_WARNING);
        self::assertSame('failed', ChannelResult::STATUS_FAILED);
        self::assertSame('disabled', ChannelResult::STATUS_DISABLED);
    }
}
