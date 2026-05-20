<?php

namespace App\Twig;

use App\Support\Json;
use RuntimeException;
use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

class AssetExtension extends AbstractExtension
{
    private string $baseDir;
    private string $baseUrl;
    private string $manifestPath;
    private string $cssManifestPath;
    private ?array $manifestCache = null;
    private ?array $cssManifestCache = null;

    public function __construct(string $baseDir, string $baseUrl = '')
    {
        $this->baseDir = $baseDir;
        $this->baseUrl = rtrim($baseUrl, '/') . '/';
        $this->manifestPath = $this->baseDir . '/assets/js/build/asset-manifest.json';
        $this->cssManifestPath = $this->baseDir . '/assets/css/build/css-manifest.json';
        $this->loadManifests();
    }

    public function getFunctions(): array
    {
        return [
            new TwigFunction('assetUrl', [$this, 'getAssetUrl']),
            new TwigFunction('asset_manifest', [$this, 'getAssetManifest']),
            new TwigFunction('css_manifest', [$this, 'getCssManifest']),
            new TwigFunction('inlineCss', [$this, 'getInlineCss']),
        ];
    }

    /**
     * Читает содержимое CSS-файла из build-директории для inline-вставки в <style>.
     * Используется для critical CSS.
     */
    public function getInlineCss(string $filename): ?string
    {
        $filePath = $this->baseDir . '/assets/css/build/' . $filename;
        if (!is_readable($filePath)) {
            return null;
        }
        $content = @file_get_contents($filePath);
        return $content !== false ? $content : null;
    }

    public function getAssetUrl(string $assetName, string $manifestType = 'js', bool $safe = false): ?string
    {
        $manifest = null;
        $manifestFilePath = '';

        if ($manifestType === 'js') {
            $manifest = $this->getAssetManifest();
            $manifestFilePath = $this->manifestPath;
        } elseif ($manifestType === 'css') {
            $manifest = $this->getCssManifest();
            $manifestFilePath = $this->cssManifestPath;
        } else {
            if ($safe) {
                error_log("AssetExtension: Неизвестный тип манифеста: '{$manifestType}'.");
                return null;
            }
            throw new RuntimeException("Неизвестный тип манифеста: '{$manifestType}'.");
        }

        if ($manifest === null) {
            if ($safe) {
                error_log("AssetExtension: Манифест '{$manifestType}' не найден: {$manifestFilePath}");
                return null;
            }
            throw new RuntimeException("Манифест '{$manifestType}' не найден: {$manifestFilePath}");
        }

        $trimmedAssetName = ltrim($assetName, '/');
        if (!isset($manifest[$assetName]) && !isset($manifest[$trimmedAssetName])) {
            if ($safe) {
                error_log("AssetExtension: Ассет '{$assetName}' отсутствует в '{$manifestType}' манифесте.");
                return null;
            }
            throw new RuntimeException("Ассет '{$assetName}' отсутствует в '{$manifestType}' манифесте.");
        }

        $key = isset($manifest[$assetName]) ? $assetName : $trimmedAssetName;
        $hashedPath = ltrim((string) $manifest[$key], '/');
        return $this->baseUrl . $hashedPath;
    }

    public function getAssetManifest(): ?array
    {
        if ($this->manifestCache !== null) {
            return $this->manifestCache;
        }

        $this->manifestCache = Json::load($this->manifestPath);
        return $this->manifestCache;
    }

    public function getCssManifest(): ?array
    {
        if ($this->cssManifestCache !== null) {
            return $this->cssManifestCache;
        }

        $this->cssManifestCache = Json::load($this->cssManifestPath);
        return $this->cssManifestCache;
    }

    private function loadManifests(): void
    {
        $this->manifestCache = $this->getAssetManifest() ?? [];
        $this->cssManifestCache = $this->getCssManifest() ?? [];
    }
}
