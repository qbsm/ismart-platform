<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Twig\DataExtension;
use PHPUnit\Framework\TestCase;

/**
 * Тесты для proposal 0003 — raw-source `<picture>`:
 * - imageVariants() резолвит raw-path в manifest entries (только существующие keys)
 * - Только downscale: skip-upscale keys не появляются в результате
 * - Контракт raw-only: путь без `/raw/` сегмента → пустой массив
 * - Манифест отсутствует → пустой массив (а не graceful fallback как у imageHas)
 * - Source extensions: webp/avif/jpg/png — нормализуются к {webp,avif} в manifest
 */
final class DataExtensionImageVariantsTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/ismart_image_variants_' . bin2hex(random_bytes(4));
        @mkdir($this->tmpDir . '/assets/img/build', 0o755, true);
        @mkdir($this->tmpDir . '/config', 0o755, true);
        file_put_contents(
            $this->tmpDir . '/config/image-sizes.json',
            (string) json_encode(['keys' => ['400', '800', '1280', '1600']]),
        );
    }

    protected function tearDown(): void
    {
        $this->cleanDir($this->tmpDir);
    }

    public function testReturnsAllKeysWhenAllPresent(): void
    {
        $this->writeManifest([
            'intro/400/desk-lemons.webp'  => ['width' => 400,  'height' => 267],
            'intro/400/desk-lemons.avif'  => ['width' => 400,  'height' => 267],
            'intro/800/desk-lemons.webp'  => ['width' => 800,  'height' => 533],
            'intro/800/desk-lemons.avif'  => ['width' => 800,  'height' => 533],
            'intro/1280/desk-lemons.webp' => ['width' => 1280, 'height' => 853],
            'intro/1280/desk-lemons.avif' => ['width' => 1280, 'height' => 853],
            'intro/1600/desk-lemons.webp' => ['width' => 1600, 'height' => 1066],
            'intro/1600/desk-lemons.avif' => ['width' => 1600, 'height' => 1066],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $variants = $ext->imageVariants('data/img/intro/raw/desk-lemons.webp');

        self::assertCount(4, $variants);
        self::assertSame('data/img/intro/400/desk-lemons.webp', $variants['400']['webp']);
        self::assertSame('data/img/intro/400/desk-lemons.avif', $variants['400']['avif']);
        self::assertSame('data/img/intro/1600/desk-lemons.webp', $variants['1600']['webp']);
    }

    public function testSkipUpscaleKeysAreNullEntries(): void
    {
        // raw mob-lemons.webp 780×1368: только 400 сгенерирован, 800/1280/1600 пропущены
        $this->writeManifest([
            'intro/400/mob-lemons.webp' => ['width' => 400, 'height' => 701],
            'intro/400/mob-lemons.avif' => ['width' => 400, 'height' => 701],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $variants = $ext->imageVariants('data/img/intro/raw/mob-lemons.webp');

        self::assertSame('data/img/intro/400/mob-lemons.webp', $variants['400']['webp']);
        self::assertSame('data/img/intro/400/mob-lemons.avif', $variants['400']['avif']);
        self::assertNull($variants['800']);
        self::assertNull($variants['1280']);
        self::assertNull($variants['1600']);
    }

    public function testWebpOnlyWhenAvifMissing(): void
    {
        $this->writeManifest([
            'intro/400/cover.webp' => ['width' => 400, 'height' => 300],
            // нет avif для 400
            'intro/800/cover.webp' => ['width' => 800, 'height' => 600],
            'intro/800/cover.avif' => ['width' => 800, 'height' => 600],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $variants = $ext->imageVariants('data/img/intro/raw/cover.webp');

        self::assertSame('data/img/intro/400/cover.webp', $variants['400']['webp']);
        self::assertNull($variants['400']['avif']);
        self::assertSame('data/img/intro/800/cover.webp', $variants['800']['webp']);
        self::assertSame('data/img/intro/800/cover.avif', $variants['800']['avif']);
    }

    public function testReturnsEmptyForPathWithoutRawSegment(): void
    {
        $this->writeManifest(['intro/400/foo.webp' => ['width' => 400, 'height' => 400]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertSame([], $ext->imageVariants('data/img/intro/foo.webp'));
        self::assertSame([], $ext->imageVariants('data/img/intro/400/foo.webp'));
        self::assertSame([], $ext->imageVariants(''));
    }

    public function testReturnsEmptyWhenManifestMissing(): void
    {
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        // Манифеста на диске нет — imageVariants возвращает [] (не graceful как imageHas).
        // Логика: imageHas нужен для гейтинга legacy-шаблонов в no-manifest состоянии;
        // imageVariants требует manifest по контракту.
        self::assertSame([], $ext->imageVariants('data/img/intro/raw/foo.webp'));
    }

    public function testSourceExtensionVariesJpgPngAvif(): void
    {
        $this->writeManifest([
            'intro/400/desk-bull.webp' => ['width' => 400, 'height' => 267],
            'intro/400/desk-bull.avif' => ['width' => 400, 'height' => 267],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        // Source может быть .jpg, .png, .webp, .avif — output всегда {webp,avif}.
        foreach (['.jpg', '.jpeg', '.png', '.webp', '.avif'] as $ext_) {
            $variants = $ext->imageVariants('data/img/intro/raw/desk-bull' . $ext_);
            self::assertSame(
                'data/img/intro/400/desk-bull.webp',
                $variants['400']['webp'] ?? null,
                "source ext $ext_",
            );
        }
    }

    public function testAcceptsAbsoluteUrl(): void
    {
        $this->writeManifest([
            'hero/400/cover.webp' => ['width' => 400, 'height' => 225],
            'hero/400/cover.avif' => ['width' => 400, 'height' => 225],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $variants = $ext->imageVariants('https://example.test/data/img/hero/raw/cover.webp');
        self::assertSame('data/img/hero/400/cover.webp', $variants['400']['webp']);
    }

    public function testUsesSizeKeysFromConfig(): void
    {
        // Запишем кастомный config с другими ключами
        file_put_contents(
            $this->tmpDir . '/config/image-sizes.json',
            (string) json_encode(['keys' => ['600', '1200']]),
        );
        $this->writeManifest([
            'x/600/foo.webp'  => ['width' => 600,  'height' => 400],
            'x/1200/foo.webp' => ['width' => 1200, 'height' => 800],
        ]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $variants = $ext->imageVariants('data/img/x/raw/foo.webp');
        // PHP auto-casts numeric string keys to int — проверяем содержимое, не точный тип.
        self::assertSame([600, 1200], array_keys($variants));
    }

    /**
     * @param array<string, array{width:int, height:int}> $entries
     */
    private function writeManifest(array $entries): void
    {
        file_put_contents(
            $this->tmpDir . '/assets/img/build/image-dimensions.json',
            (string) json_encode($entries),
        );
    }

    private function cleanDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $iter = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($iter as $file) {
            $file->isDir() ? @rmdir($file->getPathname()) : @unlink($file->getPathname());
        }
        @rmdir($dir);
    }
}
