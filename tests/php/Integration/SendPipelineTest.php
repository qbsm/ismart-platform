<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Middleware\AfterResponseMiddleware;
use App\Notification\Channel\DeferredChannel;
use App\Notification\Channel\RescueChannel;
use App\Notification\ChannelInterface;
use App\Notification\NotificationDispatcher;
use App\Support\AfterResponse;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * Сборка отправки заявки в ядре (ADR-0017): очередь приёмника по умолчанию, отложенные каналы
 * по флагу, ответ раньше задач «после ответа».
 */
final class SendPipelineTest extends TestCase
{
    private const ENV = ['FORM_DEFER_CHANNELS', 'RESCUE_QUEUE'];

    protected function tearDown(): void
    {
        foreach (self::ENV as $name) {
            putenv($name);
        }
        AfterResponse::runTasks();
    }

    public function testОчередьПриёмникаВключенаПоУмолчанию(): void
    {
        $container = $this->container();
        self::assertNotNull($this->property($container->get(RescueChannel::class), 'queue'));
        self::assertSame([], $this->deferred($container));
    }

    public function testОчередьВыключаетсяФлагом(): void
    {
        putenv('RESCUE_QUEUE=false');
        self::assertNull($this->property($this->container()->get(RescueChannel::class), 'queue'));
    }

    public function testПочтаИТелеграмПослеОтветаПоФлагу(): void
    {
        putenv('FORM_DEFER_CHANNELS=Mail, telegram');
        self::assertSame(['mail', 'telegram'], $this->deferred($this->container()));
    }

    public function testБезЗадачОтветНеТрогается(): void
    {
        $response = new AfterResponseMiddleware()->process($this->request(), $this->handler());
        self::assertFalse($response->hasHeader('Connection'));
    }

    public function testСЗадачамиОтветУходитСДлинойИЗакрытием(): void
    {
        if (AfterResponse::canFinishRequest()) {
            self::markTestSkipped('SAPI закрывает соединение сам');
        }
        AfterResponse::defer(static fn() => null);
        $response = new AfterResponseMiddleware()->process($this->request(), $this->handler());
        self::assertSame('11', $response->getHeaderLine('Content-Length'));
        self::assertSame('close', $response->getHeaderLine('Connection'));
    }

    private function container(): ContainerInterface
    {
        $root = dirname(__DIR__, 3);
        return (require $root . '/config/container.php')();
    }

    /** @return list<string> имена каналов, обёрнутых в DeferredChannel */
    private function deferred(ContainerInterface $container): array
    {
        $channels = $this->property($container->get(NotificationDispatcher::class), 'channels');
        $names = [];
        foreach ($channels as $channel) {
            if ($channel instanceof DeferredChannel) {
                $names[] = $channel->name();
            }
        }
        sort($names);
        return $names;
    }

    private function property(object $object, string $name): mixed
    {
        return new \ReflectionProperty($object, $name)->getValue($object);
    }

    private function request(): ServerRequestInterface
    {
        return new ServerRequestFactory()->createServerRequest('POST', 'http://localhost/api/send');
    }

    private function handler(): RequestHandlerInterface
    {
        return new class implements RequestHandlerInterface {
            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                $response = new ResponseFactory()->createResponse(200);
                $response->getBody()->write('{"ok":true}');
                return $response;
            }
        };
    }
}
