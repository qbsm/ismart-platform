<?php

namespace App\Twig;

use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

class UrlExtension extends AbstractExtension
{
    private string $baseUrl;

    public function __construct(string $baseUrl)
    {
        $this->baseUrl = rtrim($baseUrl, '/') . '/';
    }

    public function getFunctions(): array
    {
        return [
            new TwigFunction('url', [$this, 'generateUrl']),
        ];
    }

    public function generateUrl(?string $path = ''): string
    {
        if ($path === null) {
            return '#';
        }

        if (
            str_starts_with($path, 'http://')
            || str_starts_with($path, 'https://')
            || str_starts_with($path, '#')
            || str_starts_with($path, 'tel:')
            || str_starts_with($path, 'mailto:')
        ) {
            return $path;
        }

        $trimmedPath = ltrim($path, '/');
        if ($trimmedPath !== '' && strpos((string) basename($trimmedPath), '.') === false) {
            $trimmedPath = rtrim($trimmedPath, '/') . '/';
        }

        // Статика (data/, assets/) всегда от корня документа (public/), иначе на /ru/ картинки 404
        if ($trimmedPath !== '' && (str_starts_with($trimmedPath, 'data/') || str_starts_with($trimmedPath, 'assets/'))) {
            return '/' . $trimmedPath;
        }

        return $this->baseUrl . $trimmedPath;
    }
}
