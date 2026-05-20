<?php

declare(strict_types=1);

use App\Action\ApiSendAction;
use App\Action\HealthAction;
use App\Action\PageAction;
use App\Action\PhotoroomRemoveBackgroundAction;
use App\Action\SitemapAction;
use App\Api\PhotoroomApiClient;
use App\Handler\HttpErrorHandler;
use App\Handler\ServerErrorHandler;
use App\Middleware\CorsMiddleware;
use App\Middleware\LanguageMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\RedirectMiddleware;
use App\Middleware\RequestDurationMiddleware;
use App\Middleware\SecurityHeadersMiddleware;
use App\Service\DataLoaderService;
use App\Service\MailService;
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
                @mkdir($logDir, 0755, true);
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
        PageAction::class => \DI\autowire()
            ->constructorParameter('settings', \DI\get('settings'))
            ->constructorParameter('dispatcher', \DI\get(EventDispatcherInterface::class)),
        PhotoroomApiClient::class => static fn(ContainerInterface $c) => new PhotoroomApiClient(
            (string) ($c->get('settings')['photoroom']['api_key'] ?? ''),
            (string) ($c->get('settings')['photoroom']['base_url'] ?? 'https://image-api.photoroom.com'),
            (int) ($c->get('settings')['photoroom']['timeout'] ?? 60),
            (int) ($c->get('settings')['photoroom']['connect_timeout'] ?? 10),
            (string) ($c->get('settings')['photoroom']['sandbox_api_key'] ?? '')
        ),
        PhotoroomRemoveBackgroundAction::class => \DI\autowire()
            ->constructorParameter('settings', \DI\get('settings')),
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

        ApiSendAction::class => \DI\autowire(),
    ]);

    return $builder->build();
};
