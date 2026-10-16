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

    public function testStateCarriesReason(): void
    {
        // Приёмник кладёт эту строку в колонку каналов: голый `failed` читается там как
        // «причина не передана», и по нему не отличить отказ кабинета от несостоявшейся отправки.
        $result = ChannelResult::failed('calltouch', 'Ошибка валидации. Проверьте корректность введенного номера.');

        self::assertSame(
            'failed (Ошибка валидации. Проверьте корректность введенного номера.)',
            $result->state(),
        );
    }

    public function testStateWithoutReasonStaysBare(): void
    {
        self::assertSame('success', ChannelResult::success('mail')->state());
        self::assertSame('disabled', ChannelResult::disabled('telegram')->state());
        self::assertSame('failed', ChannelResult::failed('mail', '')->state());
    }

    public function testStateSquashesWhitespaceAndTrimsLongReason(): void
    {
        $result = ChannelResult::failed('calltouch', "  строка\n  вторая  " . str_repeat('х', 200));

        $state = $result->state();
        self::assertStringStartsWith('failed (строка вторая ', $state);
        self::assertSame(120, mb_strlen(mb_substr($state, 8, -1)));
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
