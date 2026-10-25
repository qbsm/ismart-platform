<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\AfterResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Ответ раньше задач «после ответа» там, где SAPI не умеет закрыть соединение (Apache + mod_php).
 *
 * Задачи (досылка CRM, загрузка в Метрику) выполняются в shutdown, после отдачи тела. Без длины
 * ответа браузер ждёт конца соединения — то есть и задач: на проде avtofin отправка формы занимала
 * 8 с вместо долей секунды. С `Content-Length` и `Connection: close` ответ полный, как только
 * пришли его байты; AfterResponse::run проталкивает их до задач. Тело дальше не меняется: снаружи
 * этого слоя только заголовки (CORS, безопасность, correlation id).
 */
final class AfterResponseMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);
        if (!AfterResponse::pending() || AfterResponse::canFinishRequest()) {
            return $response;
        }

        $size = $response->getBody()->getSize();
        if ($size === null) {
            return $response;
        }

        // Сжатие Apache (.htaccess: DEFLATE/BROTLI для JSON) снимает длину и отдаёт ответ кусками —
        // последний кусок уходит только с концом запроса, то есть после задач. Короткий JSON без сжатия.
        if (function_exists('apache_setenv')) {
            apache_setenv('no-gzip', '1');
            apache_setenv('no-brotli', '1');
        }

        return $response
            ->withHeader('Content-Length', (string) $size)
            ->withHeader('Connection', 'close');
    }
}
