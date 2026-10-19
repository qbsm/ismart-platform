<?php

declare(strict_types=1);

namespace App\Tests\Unit\Notification;

use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use App\Notification\NotificationDispatcher;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use RuntimeException;

final class NotificationDispatcherTest extends TestCase
{
    public function testDispatchesEnabledChannels(): void
    {
        $a = $this->stubChannel('mail', true, ChannelResult::success('mail'));
        $b = $this->stubChannel('telegram', true, ChannelResult::success('telegram', ['message_id' => 7]));

        $dispatcher = new NotificationDispatcher([$a, $b], new NullLogger());
        $results = $dispatcher->dispatch(['phone' => '+79991234567'], [], 'req-1');

        self::assertCount(2, $results);
        self::assertSame('mail', $results[0]->channel);
        self::assertSame(ChannelResult::STATUS_SUCCESS, $results[0]->status);
        self::assertSame('telegram', $results[1]->channel);
        self::assertSame(['message_id' => 7], $results[1]->meta);
    }

    public function testDisabledChannelSkipped(): void
    {
        $enabled = $this->stubChannel('mail', true, ChannelResult::success('mail'));
        $disabled = $this->stubChannel('calltouch', false, ChannelResult::success('calltouch'));

        $dispatcher = new NotificationDispatcher([$enabled, $disabled], new NullLogger());
        $results = $dispatcher->dispatch([], [], 'req-2');

        self::assertSame(ChannelResult::STATUS_SUCCESS, $results[0]->status);
        self::assertSame(ChannelResult::STATUS_DISABLED, $results[1]->status);
        self::assertSame('calltouch', $results[1]->channel);
        self::assertSame('', $results[1]->message);
    }

    public function testDisabledChannelDoesNotCallSend(): void
    {
        $disabled = new class implements ChannelInterface {
            public bool $sendCalled = false;

            public function name(): string
            {
                return 'noop';
            }

            public function isEnabled(): bool
            {
                return false;
            }

            public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
            {
                $this->sendCalled = true;
                return ChannelResult::success('noop');
            }
        };

        $dispatcher = new NotificationDispatcher([$disabled], new NullLogger());
        $dispatcher->dispatch([], [], 'req-3');

        self::assertFalse($disabled->sendCalled);
    }

    public function testThrowableIsIsolatedAsFailed(): void
    {
        $boom = new class implements ChannelInterface {
            public function name(): string
            {
                return 'boom';
            }

            public function isEnabled(): bool
            {
                return true;
            }

            public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
            {
                throw new RuntimeException('kaboom');
            }
        };
        $next = $this->stubChannel('mail', true, ChannelResult::success('mail'));

        $dispatcher = new NotificationDispatcher([$boom, $next], new NullLogger());
        $results = $dispatcher->dispatch([], [], 'req-4');

        self::assertCount(2, $results);
        self::assertSame('boom', $results[0]->channel);
        self::assertSame(ChannelResult::STATUS_FAILED, $results[0]->status);
        self::assertSame('kaboom', $results[0]->message);

        self::assertSame('mail', $results[1]->channel);
        self::assertSame(ChannelResult::STATUS_SUCCESS, $results[1]->status);
    }

    public function testPreservesOrderInResults(): void
    {
        $first = $this->stubChannel('first', true, ChannelResult::success('first'));
        $second = $this->stubChannel('second', true, ChannelResult::failed('second', 'x'));
        $third = $this->stubChannel('third', false, ChannelResult::success('third'));
        $fourth = $this->stubChannel('fourth', true, ChannelResult::warning('fourth', 'partial'));

        $dispatcher = new NotificationDispatcher([$first, $second, $third, $fourth], new NullLogger());
        $results = $dispatcher->dispatch([], [], 'req-5');

        self::assertSame(['first', 'second', 'third', 'fourth'], array_map(fn($r) => $r->channel, $results));
        self::assertSame(
            [
                ChannelResult::STATUS_SUCCESS,
                ChannelResult::STATUS_FAILED,
                ChannelResult::STATUS_DISABLED,
                ChannelResult::STATUS_WARNING,
            ],
            array_map(fn($r) => $r->status, $results),
        );
    }

    public function testEmptyChannelsListReturnsEmpty(): void
    {
        $dispatcher = new NotificationDispatcher([], new NullLogger());
        $results = $dispatcher->dispatch([], [], 'req-6');

        self::assertSame([], $results);
    }

    private function stubChannel(string $name, bool $enabled, ChannelResult $result): ChannelInterface
    {
        return new class ($name, $enabled, $result) implements ChannelInterface {
            public function __construct(
                private readonly string $channelName,
                private readonly bool $enabled,
                private readonly ChannelResult $result,
            ) {}

            public function name(): string
            {
                return $this->channelName;
            }

            public function isEnabled(): bool
            {
                return $this->enabled;
            }

            public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
            {
                return $this->result;
            }
        };
    }
}
