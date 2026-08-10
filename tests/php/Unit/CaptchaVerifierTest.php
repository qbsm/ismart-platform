<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Security\CaptchaVerifier;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class CaptchaVerifierTest extends TestCase
{
    private const CONFIG = [
        'enable' => true,
        'client_key' => 'ysc1_public',
        'server_key' => 'ysc2_secret',
        'timeout' => 5,
    ];

    private function verifier(HttpClientInterface $client, array $config = self::CONFIG): CaptchaVerifier
    {
        return new CaptchaVerifier($client, new NullLogger(), $config);
    }

    public function testDisabledPassesEverything(): void
    {
        $verifier = $this->verifier(new MockHttpClient(), ['enable' => false]);
        $verdict = $verifier->verify('', '127.0.0.1', 'req');

        self::assertTrue($verdict['passed']);
        self::assertSame('disabled', $verdict['reason']);
    }

    public function testEnabledRequiresKeys(): void
    {
        $verifier = $this->verifier(new MockHttpClient(), ['enable' => true, 'client_key' => 'ysc1_public']);

        self::assertFalse($verifier->isEnabled());
    }

    public function testHumanPasses(): void
    {
        $client = new MockHttpClient(new MockResponse('{"status":"ok"}'));
        $verdict = $this->verifier($client)->verify('token', '127.0.0.1', 'req');

        self::assertTrue($verdict['passed']);
        self::assertSame('ok', $verdict['reason']);
    }

    public function testRobotRejected(): void
    {
        $client = new MockHttpClient(new MockResponse('{"status":"failed","message":"Invalid or expired Token."}'));
        $verdict = $this->verifier($client)->verify('token', '127.0.0.1', 'req');

        self::assertFalse($verdict['passed']);
        self::assertSame('failed', $verdict['reason']);
    }

    public function testEmptyTokenRejected(): void
    {
        $verdict = $this->verifier(new MockHttpClient())->verify('', '127.0.0.1', 'req');

        self::assertFalse($verdict['passed']);
        self::assertSame('empty', $verdict['reason']);
    }

    /**
     * Сторонний сервис лёг — заявка живого человека важнее строгости проверки.
     */
    public function testServiceFailurePasses(): void
    {
        $client = new MockHttpClient(static function () {
            throw new \Symfony\Component\HttpClient\Exception\TransportException('нет связи');
        });
        $verdict = $this->verifier($client)->verify('token', '127.0.0.1', 'req');

        self::assertTrue($verdict['passed']);
        self::assertSame('unavailable', $verdict['reason']);
    }

    public function testGarbageAnswerPasses(): void
    {
        $client = new MockHttpClient(new MockResponse('не json', ['http_code' => 502]));
        $verdict = $this->verifier($client)->verify('token', '127.0.0.1', 'req');

        self::assertTrue($verdict['passed']);
        self::assertSame('unavailable', $verdict['reason']);
    }
}
