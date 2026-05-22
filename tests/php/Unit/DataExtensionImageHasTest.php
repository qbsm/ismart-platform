<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Twig\DataExtension;
use PHPUnit\Framework\TestCase;

/**
 * Тесты для ADR-0006 — manifest-driven `<picture>`:
 * - imageHas() корректно нормализует все 4 формы пути в один manifest-ключ
 * - getImageDimensions() работает с абсолютными URL (CLS-fix)
 * - graceful fallback: при отсутствии манифеста imageHas → true (текущее поведение)
 */
final class DataExtensionImageHasTest extends TestCase
{
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/ismart_image_has_' . bin2hex(random_bytes(4));
        @mkdir($this->tmpDir . '/data/img', 0o755, true);
    }

    protected function tearDown(): void
    {
        $this->cleanDir($this->tmpDir);
    }

    public function testImageHasReturnsTrueForKnownPath(): void
    {
        $this->writeManifest(['intro/800/foo.webp' => ['width' => 800, 'height' => 600]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertTrue($ext->imageHas('intro/800/foo.webp'));
        self::assertTrue($ext->imageHas('data/img/intro/800/foo.webp'));
        self::assertTrue($ext->imageHas('/data/img/intro/800/foo.webp'));
        self::assertTrue($ext->imageHas('https://example.test/data/img/intro/800/foo.webp'));
        self::assertTrue($ext->imageHas('https://cdn.other.com/data/img/intro/800/foo.webp'));
    }

    public function testImageHasReturnsFalseForUnknownPath(): void
    {
        $this->writeManifest(['intro/800/foo.webp' => ['width' => 800, 'height' => 600]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertFalse($ext->imageHas('intro/1600/foo.avif'));
        self::assertFalse($ext->imageHas('data/img/missing.webp'));
        self::assertFalse($ext->imageHas('https://example.test/data/img/unknown.avif'));
    }

    public function testImageHasReturnsFalseOnEmptyPath(): void
    {
        $this->writeManifest(['x' => ['width' => 1, 'height' => 1]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertFalse($ext->imageHas(''));
        self::assertFalse($ext->imageHas('/'));
        self::assertFalse($ext->imageHas('data/img/'));
    }

    public function testImageHasGracefulFallbackWhenManifestMissing(): void
    {
        // Манифеста на диске нет — имитируем свежий клон без `npm run build:images`.
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertTrue($ext->imageHas('any/path/foo.webp'));
        self::assertTrue($ext->imageHas('https://host/data/img/anything.avif'));
        // Но пустой путь всё равно false — это не «нет манифеста», это невалидный input.
        self::assertFalse($ext->imageHas(''));
    }

    public function testGetImageDimensionsWorksForAbsoluteUrl(): void
    {
        $this->writeManifest(['hero/cover.webp' => ['width' => 1920, 'height' => 1080]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        $dims = $ext->getImageDimensions('https://example.test/data/img/hero/cover.webp');
        self::assertSame(['width' => 1920, 'height' => 1080], $dims);

        $dims = $ext->getImageDimensions('data/img/hero/cover.webp');
        self::assertSame(['width' => 1920, 'height' => 1080], $dims);

        $dims = $ext->getImageDimensions('hero/cover.webp');
        self::assertSame(['width' => 1920, 'height' => 1080], $dims);
    }

    public function testGetImageDimensionsReturnsNullForMissingEntry(): void
    {
        $this->writeManifest(['foo.webp' => ['width' => 100, 'height' => 100]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertNull($ext->getImageDimensions('https://example.test/data/img/missing.webp'));
        self::assertNull($ext->getImageDimensions(''));
    }

    public function testManifestLoadedOnce(): void
    {
        $this->writeManifest(['a.webp' => ['width' => 10, 'height' => 10]]);
        $ext = new DataExtension($this->tmpDir, 'https://example.test/');

        self::assertTrue($ext->imageHas('a.webp'));
        // Удаляем файл — но манифест уже в памяти, повторный вызов должен использовать кэш.
        unlink($this->tmpDir . '/data/img/image-dimensions.json');
        self::assertTrue($ext->imageHas('a.webp'));
    }

    /**
     * @param array<string, array{width:int, height:int}> $entries
     */
    private function writeManifest(array $entries): void
    {
        file_put_contents(
            $this->tmpDir . '/data/img/image-dimensions.json',
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
