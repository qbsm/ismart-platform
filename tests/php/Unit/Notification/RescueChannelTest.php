<?php

declare(strict_types=1);

namespace Tests\Unit\Notification;

use App\Notification\Channel\RescueChannel;
use App\Support\AfterResponse;
use App\Support\RescueQueue;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Component\HttpClient\Response\MockResponse;

final class RescueChannelTest extends TestCase
{
    /** @param array<string,mixed> $config */
    private function channel(MockHttpClient $http, array $config = []): RescueChannel
    {
        return new RescueChannel($http, new NullLogger(), $config + [
            'enable' => true,
            'url' => 'https://api.example/v1/lead',
            'site' => 'example.ru',
        ]);
    }

    public function testВыключенБезСайта(): void
    {
        $c = new RescueChannel(new MockHttpClient(), new NullLogger(), [
            'enable' => true,
            'url' => 'https://api.example/v1/lead',
            'site' => '',
        ]);
        $this->assertFalse($c->isEnabled());
    }

    public function testВыключенБезФлага(): void
    {
        $c = $this->channel(new MockHttpClient(), ['enable' => false]);
        $this->assertFalse($c->isEnabled());
    }

    public function testУспешныйПриём(): void
    {
        $http = new MockHttpClient(new MockResponse('{"ok":true,"id":42}', ['http_code' => 201]));
        $r = $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertSame('success', $r->status);
        $this->assertSame('42', $r->meta['id']);
    }

    public function testПовторСТемЖеRequestIdСчитаетсяУспехом(): void
    {
        // Приёмник распознал дубль — заявка у него, создавать вторую не нужно.
        $http = new MockHttpClient(new MockResponse('{"ok":true,"id":42,"duplicate":true}', ['http_code' => 200]));
        $r = $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertSame('success', $r->status);
    }

    public function testОтказПриёмникаЭтоПредупреждение(): void
    {
        // 4xx — данные не приняты, повтор не поможет: канал не считается упавшим.
        $http = new MockHttpClient(new MockResponse('{"ok":false,"error":"forbidden"}', ['http_code' => 403]));
        $r = $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertSame('warning', $r->status);
    }

    public function testСерверОтвечаетПятисоткойЭтоОтказ(): void
    {
        $http = new MockHttpClient(new MockResponse('{"ok":false}', ['http_code' => 502]));
        $r = $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertSame('failed', $r->status);
    }

    public function testВПолезнойНагрузкеЕстьДоменИIdЗапроса(): void
    {
        $captured = null;
        $http = new MockHttpClient(function (string $method, string $url, array $options) use (&$captured) {
            $captured = json_decode($options['body'], true);
            return new MockResponse('{"ok":true,"id":1}', ['http_code' => 201]);
        });
        $this->channel($http)->send(['phone' => '+79990000000', 'Имя' => 'Пётр'], [], 'req-7');
        $this->assertSame('example.ru', $captured['site']);
        $this->assertSame('req-7', $captured['request_id']);
        $this->assertSame('Пётр', $captured['Имя']);
    }

    public function testКлючНеОтправляетсяЕслиНеЗадан(): void
    {
        // По умолчанию подтверждение идёт по домену, лишний пустой ключ слать незачем.
        $captured = null;
        $http = new MockHttpClient(function (string $method, string $url, array $options) use (&$captured) {
            $captured = json_decode($options['body'], true);
            return new MockResponse('{"ok":true,"id":1}', ['http_code' => 201]);
        });
        $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertArrayNotHasKey('key', $captured);
    }

    private function queueDir(): string
    {
        $dir = sys_get_temp_dir() . '/rescue-queue-' . bin2hex(random_bytes(4));
        mkdir($dir);
        return $dir;
    }

    /** @param array<string,mixed> $config */
    private function queued(MockHttpClient $http, RescueQueue $queue, array $config = []): RescueChannel
    {
        return new RescueChannel($http, new NullLogger(), $config + [
            'enable' => true,
            'url' => 'https://api.example/v1/lead',
            'site' => 'example.ru',
        ], $queue);
    }

    public function testСбойСетиСОчередью_заявкаВОчередиИДосылаетсяБезДубля(): void
    {
        // 21–24.10: DNS не нашёл api.ismart.pro за 3 с — заявка в приёмник не попала.
        $dir = $this->queueDir();
        $queue = new RescueQueue(new NullLogger(), $dir);
        $bodies = [];
        $http = new MockHttpClient(function (string $m, string $u, array $o) use (&$bodies) {
            $bodies[] = json_decode($o['body'], true);
            if (count($bodies) === 1) {
                throw new TransportException('Resolving timed out after 3000 milliseconds');
            }
            return new MockResponse('{"ok":true,"id":7}', ['http_code' => 201]);
        });
        $channel = $this->queued($http, $queue);

        $r = $channel->send(['phone' => '+79990000000', 'idempotency_key' => 'sess-1'], [], 'req-1');
        $this->assertSame('success', $r->status);
        $this->assertTrue($r->meta['queued']);
        $this->assertCount(1, $queue->items());

        $this->assertSame(['sent' => 1, 'left' => 0], $channel->flushQueue());
        // Тот же request_id — приёмник распознает повтор, дубля не будет.
        $this->assertSame('sess-1', $bodies[1]['request_id']);
        $this->assertSame($bodies[0], $bodies[1]);
        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }

    public function testПятисоткаСОчередью_вОчередь_отказ4xx_нет(): void
    {
        $dir = $this->queueDir();
        $queue = new RescueQueue(new NullLogger(), $dir);
        $r = $this->queued(new MockHttpClient(new MockResponse('{"ok":false}', ['http_code' => 502])), $queue)
            ->send(['phone' => '+79990000000'], [], 'req-2');
        $this->assertSame('success', $r->status);
        $this->assertCount(1, $queue->items());

        $r = $this->queued(new MockHttpClient(new MockResponse('{"ok":false,"error":"forbidden"}', ['http_code' => 403])), $queue)
            ->send(['phone' => '+79990000001'], [], 'req-3');
        $this->assertSame('warning', $r->status);
        $this->assertCount(1, $queue->items());
        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }

    public function testДосылкаОстанавливаетсяНаНедоступномПриёмнике(): void
    {
        $dir = $this->queueDir();
        $queue = new RescueQueue(new NullLogger(), $dir);
        $queue->enqueue(['site' => 'example.ru', 'request_id' => 'a']);
        $queue->enqueue(['site' => 'example.ru', 'request_id' => 'b']);
        $calls = 0;
        $http = new MockHttpClient(function () use (&$calls) {
            $calls++;
            throw new TransportException('down');
        });
        $this->assertSame(['sent' => 0, 'left' => 2], $this->queued($http, $queue)->flushQueue());
        $this->assertSame(1, $calls);
        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }

    public function testИтогиКаналовЗаявкиВОчереди_уходятПослеНеёИПовторяютсяНа404(): void
    {
        $dir = $this->queueDir();
        $queue = new RescueQueue(new NullLogger(), $dir);
        $calls = [];
        $leadUp = false;
        $channelsUp = false;
        $http = new MockHttpClient(function (string $m, string $url, array $o) use (&$calls, &$leadUp, &$channelsUp) {
            $isChannels = str_ends_with($url, '/channels');
            $calls[] = $isChannels ? 'channels' : 'lead';
            if (!$isChannels) {
                if (!$leadUp) {
                    throw new TransportException('Resolving timed out');
                }
                return new MockResponse('{"ok":true,"id":9}', ['http_code' => 201]);
            }
            return new MockResponse('{}', ['http_code' => $channelsUp ? 200 : 404]);
        });
        $channel = $this->queued($http, $queue);

        AfterResponse::runTasks();
        $channel->send(['phone' => '+79990000000', 'idempotency_key' => 'sess-9'], [], 'req-9');
        $channel->reportChannels(['mail' => 'success'], 'sess-9');
        $this->assertSame(['lead'], $calls);
        // После ответа: досылка заявки снова не прошла — итоги не пробуются, а встают за ней.
        AfterResponse::runTasks();
        $this->assertSame(['lead', 'lead'], $calls);
        $this->assertSame(['lead', 'channels'], array_column($queue->items(), 'kind'));

        // Заявка доехала, итоги получили 404 — остаются в очереди.
        $leadUp = true;
        $this->assertSame(['sent' => 1, 'left' => 1], $channel->flushQueue());
        $this->assertSame(['channels'], array_column($queue->items(), 'kind'));

        $channelsUp = true;
        $this->assertSame(['sent' => 0, 'left' => 0], $channel->flushQueue());
        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }

    public function testИтогиОтвергнутойЗаявкиОтбрасываются(): void
    {
        $dir = $this->queueDir();
        $queue = new RescueQueue(new NullLogger(), $dir);
        $queue->enqueue(['site' => 'example.ru', 'request_id' => 'r']);
        $queue->enqueue(['site' => 'example.ru', 'request_id' => 'r', 'channels' => ['mail' => 'success']], RescueQueue::CHANNELS);
        $http = new MockHttpClient(new MockResponse('{"ok":false,"error":"bad"}', ['http_code' => 422]));
        $this->assertSame(['sent' => 0, 'left' => 0], $this->queued($http, $queue)->flushQueue());
        array_map('unlink', glob($dir . '/*') ?: []);
        rmdir($dir);
    }
}
