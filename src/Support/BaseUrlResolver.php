<?php

namespace App\Support;

use Psr\Http\Message\ServerRequestInterface;

final class BaseUrlResolver
{
    public function resolve(ServerRequestInterface $request): string
    {
        // Priority 1: APP_BASE_URL из .env (production override).
        // Нужно когда SCRIPT_NAME = /public/index.php (через корневой .htaccess rewrite),
        // но публичный URL без /public/.
        $envBase = (string) ($_ENV['APP_BASE_URL'] ?? (getenv('APP_BASE_URL') ?: ''));
        if ($envBase !== '') {
            return rtrim($envBase, '/') . '/';
        }

        $uri = $request->getUri();
        $forwarded = $request->getHeaderLine('X-Forwarded-Proto');
        $scheme = $forwarded !== '' ? $forwarded : ($uri->getScheme() !== '' ? $uri->getScheme() : 'http');
        $host = $uri->getHost() !== '' ? $uri->getHost() : 'localhost';
        $port = $uri->getPort();

        $authority = $host;
        if ($port !== null && !in_array([$scheme, $port], [['http', 80], ['https', 443]], true)) {
            $authority .= ':' . $port;
        }

        $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/');
        $scriptDir = str_replace('\\', '/', dirname($scriptName));
        $basePath = $scriptDir === '/' || $scriptDir === '.' ? '' : rtrim($scriptDir, '/');
        // Edge case: rewrite /xxx → public/index.php даёт SCRIPT_NAME=/public/index.php.
        // Срезаем /public из basePath — публичный URL не имеет этого префикса.
        if ($basePath === '/public') {
            $basePath = '';
        }

        return $scheme . '://' . $authority . $basePath . '/';
    }
}
