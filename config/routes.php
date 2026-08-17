<?php

declare(strict_types=1);

use App\Action\ApiFormTokenAction;
use App\Action\ApiSendAction;
use App\Action\ApiWidgetRescueAction;
use App\Action\HealthAction;
use App\Action\PageAction;
use App\Action\SitemapAction;
use Slim\App;

return static function (App $app): void {
    $app->get('/health', HealthAction::class);
    $app->get('/api/form-token[/]', ApiFormTokenAction::class);
    $app->post('/api/send[/]', ApiSendAction::class);
    $app->post('/api/widget-rescue[/]', ApiWidgetRescueAction::class);
    // Приёмник событий воронки для площадок, где nginx не наш: сам факт запроса уже попал
    // в access-лог, приложению остаётся ответить пустым 204. sendBeacon шлёт POST.
    $app->map(['GET', 'POST'], '/_f', static fn($request, $response) => $response->withStatus(204));
    $app->get('/sitemap.xml', SitemapAction::class);

    // Маршруты деплоймента (оплата, свои API) — в config/project-routes.php: они должны
    // объявляться ДО catch-all страницы, но не в синкаемом файле, иначе distill их снесёт.
    $projectRoutesPath = __DIR__ . '/project-routes.php';
    if (is_file($projectRoutesPath)) {
        (require $projectRoutesPath)($app);
    }

    $app->get('/', PageAction::class);
    $app->get('/{page}[/{params:.*}]', PageAction::class);
};
