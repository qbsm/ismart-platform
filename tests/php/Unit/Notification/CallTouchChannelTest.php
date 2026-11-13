<?php

declare(strict_types=1);

namespace Tests\Unit\Notification;

use App\Notification\Channel\CallTouchChannel;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class CallTouchChannelTest extends TestCase
{
    /** @var array<string,mixed> */
    private array $sent = [];

    /** @param array<string,mixed> $config */
    private function channel(string $answer, array $config): CallTouchChannel
    {
        $http = new MockHttpClient(function (string $method, string $url, array $options) use ($answer): MockResponse {
            $this->sent = ['url' => $url, 'body' => $options['body'] ?? ''];
            return new MockResponse($answer, ['http_code' => 200]);
        });

        return new CallTouchChannel($http, new NullLogger(), $config + ['enable' => true]);
    }

    /** @return array<string,mixed> */
    private function callbackBody(): array
    {
        return json_decode((string) $this->sent['body'], true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string,string> */
    private function requestBody(): array
    {
        parse_str((string) $this->sent['body'], $out);
        return $out;
    }

    public function testКолбекПередаётIpПосетителяИСтраницу(): void
    {
        $c = $this->channel('{"data":{"widgetRequestId":1}}', ['route_key' => 'k', 'token' => 't']);
        $c->send(['phone' => '89991234567', '_ip' => '95.165.1.2', 'current_url' => 'https://a.ru/?utm_source=y'], [], 'r');
        $body = $this->callbackBody();
        $this->assertSame('95.165.1.2', $body['clientIp']);
        $this->assertSame('https://a.ru/?utm_source=y', $body['callUrl']);
    }

    public function testВнутреннийАдресНеПередаётся(): void
    {
        $c = $this->channel('{"data":{"widgetRequestId":1}}', ['route_key' => 'k', 'token' => 't']);
        $c->send(['phone' => '89991234567', '_ip' => '172.18.0.1'], [], 'r');
        $this->assertArrayNotHasKey('clientIp', $this->callbackBody());
    }

    public function testЗаявкаПередаётIpПосетителя(): void
    {
        $c = $this->channel('{"requestId":5}', ['site_id' => '86337']);
        $c->send(['phone' => '89991234567', '_ip' => '2a00:1450:4010:c05::8b', 'page_url' => 'https://a.ru/'], [], 'r');
        $body = $this->requestBody();
        $this->assertSame('2a00:1450:4010:c05::8b', $body['clientIp']);
        $this->assertSame('https://a.ru/', $body['requestUrl']);
    }
}
