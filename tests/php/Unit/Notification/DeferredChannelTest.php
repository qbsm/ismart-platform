<?php

declare(strict_types=1);

namespace Tests\Unit\Notification;

use App\Notification\Channel\DeferredChannel;
use App\Notification\ChannelInterface;
use App\Notification\ChannelResult;
use App\Support\AfterResponse;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

final class DeferredChannelTest extends TestCase
{
    private function inner(int &$calls): ChannelInterface
    {
        return new class ($calls) implements ChannelInterface {
            public function __construct(private int &$calls) {}

            public function name(): string
            {
                return 'mail';
            }

            public function isEnabled(): bool
            {
                return true;
            }

            public function send(array $formData, array $uploadedFiles, string $requestId): ChannelResult
            {
                $this->calls++;
                return ChannelResult::failed('mail', 'smtp down');
            }
        };
    }

    public function testОтправкаПослеОтвета_сразуУспехБезВызоваКанала(): void
    {
        AfterResponse::runTasks();
        $calls = 0;
        $channel = new DeferredChannel($this->inner($calls), new NullLogger());

        $result = $channel->send(['phone' => '+79990000000'], [], 'req-1');

        $this->assertSame('success', $result->status);
        $this->assertTrue($result->meta['deferred']);
        $this->assertSame(0, $calls);
        $this->assertTrue(AfterResponse::pending());

        AfterResponse::runTasks();
        $this->assertSame(1, $calls);
        $this->assertSame('failed (smtp down)', DeferredChannel::results()['mail']);
    }

    public function testСФайламиОтправляетСразу(): void
    {
        $calls = 0;
        $channel = new DeferredChannel($this->inner($calls), new NullLogger());

        $result = $channel->send(['phone' => '+79990000000'], ['file' => 'x'], 'req-2');

        $this->assertSame('failed', $result->status);
        $this->assertSame(1, $calls);
    }
}
