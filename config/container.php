<?php

declare(strict_types=1);

use App\Action\ApiSendAction;
use App\Action\HealthAction;
use App\Action\PageAction;
use App\Action\SitemapAction;
use App\Handler\HttpErrorHandler;
use App\Handler\ServerErrorHandler;
use App\Middleware\CorsMiddleware;
use App\Middleware\LanguageMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\RedirectMiddleware;
use App\Middleware\RequestDurationMiddleware;
use App\Middleware\SecurityHeadersMiddleware;
use App\Notification\Channel\CallTouchChannel;
use App\Notification\Channel\GoogleSheetsChannel;
use App\Notification\Channel\MailChannel;
use App\Notification\Channel\TelegramChannel;
use App\Notification\NotificationDispatcher;
use App\Service\DataLoaderService;
use App\Service\DefaultSeoBuilder;
use App\Service\MailService;
use App\Service\SeoBuilderRegistry;
use App\Twig\AssetExtension;
use App\Twig\DataExtension;
use App\Twig\UrlExtension;
use DI\ContainerBuilder;
use League\Event\EventDispatcher;
use Monolog\Formatter\JsonFormatter;
use Monolog\Handler\RotatingFileHandler;
use Monolog\Logger;
use Psr\Container\ContainerInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Log\LoggerInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Views\Twig;
use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Contracts\HttpClient\HttpClientInterface;
use Twig\Extension\DebugExtension;
use Twig\Extension\StringLoaderExtension;

return static function (): ContainerInterface {
    $settings = require __DIR__ . '/settings.php';
    $builder = new ContainerBuilder();

    $builder->addDefinitions([
        'settings' => $settings,
        'displayErrorDetails' => (bool) ($settings['twig']['debug'] ?? false),
        'errorMap' => $settings['errors'] ?? [],

        ResponseFactoryInterface::class => \DI\get(ResponseFactory::class),

        LoggerInterface::class => static function () use ($settings): LoggerInterface {
            $logDir = (string) ($settings['paths']['logs'] ?? '');
            if ($logDir !== '' && !is_dir($logDir)) {
                @mkdir($logDir, 0o755, true);
            }

            $logger = new Logger('app');
            $logFile = rtrim($logDir, '/') . '/app.log';
            $level = ($settings['env'] ?? 'development') === 'production' ? Logger::WARNING : Logger::DEBUG;
            $handler = new RotatingFileHandler($logFile, 14, $level);
            $handler->setFormatter(new JsonFormatter());
            $logger->pushHandler($handler);
            return $logger;
        },

        EventDispatcherInterface::class => static function (): EventDispatcherInterface {
            return new EventDispatcher();
        },

        Twig::class => static function (ContainerInterface $container) use ($settings): Twig {
            $baseDir = (string) $settings['project_root'];
            $baseUrl = rtrim((string) ($_ENV['APP_BASE_URL'] ?? $_SERVER['APP_BASE_URL'] ?? getenv('APP_BASE_URL') ?: ''), '/');
            if ($baseUrl === '') {
                // За прокси схема приходит в X-Forwarded-Proto; иначе HTTPS
                $proto = (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '');
                $https = ($proto === 'https' || (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on')) ? 'https://' : 'http://';
                $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
                $scriptDir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
                $basePath = $scriptDir === '/' || $scriptDir === '.' ? '' : rtrim($scriptDir, '/');
                $baseUrl = $https . $host . $basePath;
            }
            // В production всегда https для baseUrl (иначе mixed content и CSP блокирует CSS/JS)
            if (($settings['env'] ?? '') === 'production' && str_starts_with($baseUrl, 'http://')) {
                $baseUrl = 'https://' . substr($baseUrl, 7);
            }
            $baseUrl .= '/';

            $twig = Twig::create((string) $settings['paths']['templates'], $settings['twig']);
            $env = $twig->getEnvironment();
            $env->addExtension(new StringLoaderExtension());
            $env->addExtension(new AssetExtension($baseDir, $baseUrl));
            $env->addExtension(new UrlExtension($baseUrl));
            $env->addExtension(new DataExtension($baseDir, $baseUrl));

            if (!empty($settings['twig']['debug'])) {
                $env->addExtension(new DebugExtension());
            }

            $global = $container->get(DataLoaderService::class)->loadGlobal(
                (string) $settings['paths']['json_global'],
                $baseUrl
            );
            $env->addGlobal('base_url', $baseUrl);
            $env->addGlobal('global', $global);

            return $twig;
        },

        SecurityHeadersMiddleware::class => static fn(ContainerInterface $c) => new SecurityHeadersMiddleware(
            ($c->get('settings')['env'] ?? 'development') === 'production'
        ),

        RequestDurationMiddleware::class => \DI\autowire(),

        HealthAction::class => \DI\autowire(),

        // SEO Strategy: реестр builder'ов по типу коллекции + DefaultSeoBuilder как fallback.
        // Deployments расширяют через config-override этого binding'а, добавляя свои Builder'ы:
        //   SeoBuilderRegistry::class => static fn(ContainerInterface $c) => new SeoBuilderRegistry(
        //       ['restaurants' => $c->get(RestaurantSeoBuilder::class)],
        //       $c->get(DefaultSeoBuilder::class),
        //   ),
        DefaultSeoBuilder::class => \DI\autowire(),
        SeoBuilderRegistry::class => static fn(ContainerInterface $c) => new SeoBuilderRegistry(
            [],
            $c->get(DefaultSeoBuilder::class),
        ),

        PageAction::class => \DI\autowire()
            ->constructorParameter('settings', \DI\get('settings'))
            ->constructorParameter('dispatcher', \DI\get(EventDispatcherInterface::class))
            ->constructorParameter('seoBuilderRegistry', \DI\get(SeoBuilderRegistry::class)),
        SitemapAction::class => \DI\autowire()->constructorParameter('settings', \DI\get('settings')),
        ServerErrorHandler::class => \DI\autowire()->constructorParameter('displayErrorDetails', \DI\get('displayErrorDetails')),
        HttpErrorHandler::class => \DI\autowire()->constructorParameter('errorMap', \DI\get('errorMap')),
        RedirectMiddleware::class => \DI\autowire()->constructorParameter('settings', \DI\get('settings')),
        LanguageMiddleware::class => \DI\autowire()->constructorParameter('settings', \DI\get('settings')),
        CorsMiddleware::class => static fn(ContainerInterface $c) => new CorsMiddleware(
            $c->get(ResponseFactoryInterface::class),
            $c->get('settings')['cors'] ?? []
        ),
        RateLimitMiddleware::class => static function (ContainerInterface $c) {
            $s = $c->get('settings');
            return new RateLimitMiddleware(
                $c->get(ResponseFactoryInterface::class),
                $s['rate_limit_api_send'] ?? [],
                $s['paths']['cache'] ?? ''
            );
        },

        MailerInterface::class => static function (ContainerInterface $c): MailerInterface {
            $dsn = (string) ($c->get('settings')['mail']['dsn'] ?? 'sendmail://default');
            return new Mailer(Transport::fromDsn($dsn));
        },

        MailService::class => static function (ContainerInterface $c): MailService {
            return new MailService(
                $c->get(MailerInterface::class),
                $c->get(LoggerInterface::class),
                $c->get('settings')['mail'] ?? [],
            );
        },

        HttpClientInterface::class => static fn() => HttpClient::create(),

        MailChannel::class => static fn(ContainerInterface $c) => new MailChannel(
            $c->get(MailService::class),
            $c->get('settings')['mail'] ?? [],
        ),

        CallTouchChannel::class => static fn(ContainerInterface $c) => new CallTouchChannel(
            $c->get(HttpClientInterface::class),
            $c->get(LoggerInterface::class),
            $c->get('settings')['calltouch'] ?? [],
        ),

        TelegramChannel::class => static fn(ContainerInterface $c) => new TelegramChannel(
            $c->get(HttpClientInterface::class),
            $c->get(LoggerInterface::class),
            $c->get('settings')['telegram'] ?? [],
        ),

        GoogleSheetsChannel::class => static fn(ContainerInterface $c) => new GoogleSheetsChannel(
            $c->get(HttpClientInterface::class),
            $c->get(LoggerInterface::class),
            $c->get('settings')['google_sheets'] ?? [],
            (string) ($c->get('settings')['project_root'] ?? ''),
        ),

        NotificationDispatcher::class => static fn(ContainerInterface $c) => new NotificationDispatcher(
            [
                $c->get(MailChannel::class),
                $c->get(CallTouchChannel::class),
                $c->get(TelegramChannel::class),
                $c->get(GoogleSheetsChannel::class),
            ],
            $c->get(LoggerInterface::class),
        ),

        ApiSendAction::class => \DI\autowire(),
    ]);

    return $builder->build();
};
