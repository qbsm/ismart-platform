<?php

declare(strict_types=1);

namespace Tests\Unit\Notification;

use App\Notification\Channel\RescueChannel;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
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
        $http = new MockHttpClient(new MockResponse('{"ok":true,"lead":42}', ['http_code' => 201]));
        $r = $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertSame('success', $r->status);
        $this->assertSame('42', $r->meta['lead']);
    }

    public function testПовторСТемЖеRequestIdСчитаетсяУспехом(): void
    {
        // Приёмник распознал дубль — заявка у него, создавать вторую не нужно.
        $http = new MockHttpClient(new MockResponse('{"ok":true,"lead":42,"duplicate":true}', ['http_code' => 200]));
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
            return new MockResponse('{"ok":true,"lead":1}', ['http_code' => 201]);
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
            return new MockResponse('{"ok":true,"lead":1}', ['http_code' => 201]);
        });
        $this->channel($http)->send(['phone' => '+79990000000'], [], 'req-1');
        $this->assertArrayNotHasKey('key', $captured);
    }
}
