<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\DataLoaderService;
use PHPUnit\Framework\TestCase;

final class DataLoaderServiceTest extends TestCase
{
    private DataLoaderService $service;

    protected function setUp(): void
    {
        $this->service = new DataLoaderService();
    }

    public function testLoadJsonReturnsNullForMissingFile(): void
    {
        $result = $this->service->loadJson(__DIR__ . '/../fixtures/nonexistent.json', 'https://example.com/');
        self::assertNull($result);
    }

    public function testLoadJsonReturnsNullForInvalidJson(): void
    {
        $path = __DIR__ . '/../fixtures/invalid.json';
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }
        file_put_contents($path, '{ invalid }');
        try {
            $result = $this->service->loadJson($path, 'https://example.com/');
            self::assertNull($result);
        } finally {
            @unlink($path);
        }
    }

    public function testLoadJsonReturnsArrayAndProcessesPaths(): void
    {
        $path = $this->getGlobalJsonPath();
        if (!is_file($path)) {
            self::markTestSkipped('data/json/global.json not found');
        }
        $result = $this->service->loadJson($path, 'https://example.com/');
        self::assertIsArray($result);
        self::assertArrayHasKey('lang', $result);
    }

    public function testLoadPageReturnsNullForMissingPage(): void
    {
        $pagesDir = dirname(__DIR__, 2) . '/data/json/ru/pages';
        $result = $this->service->loadPage($pagesDir, 'nonexistent-page-id', 'https://example.com/');
        self::assertNull($result);
    }

    public function testLoadPageReturnsDataForExistingPage(): void
    {
        $pagesDir = dirname(__DIR__, 2) . '/data/json/ru/pages';
        if (!is_dir($pagesDir)) {
            self::markTestSkipped('data/json/ru/pages not found');
        }
        $result = $this->service->loadPage($pagesDir, 'index', 'https://example.com/');
        if ($result === null) {
            self::markTestSkipped('data/json/ru/pages/index.json not found');
        }
        self::assertIsArray($result);
        self::assertArrayHasKey('sections', $result);
    }

    public function testLoadGlobalReturnsEmptyArrayWhenFileMissing(): void
    {
        $result = $this->service->loadGlobal(__DIR__ . '/../fixtures/nonexistent.json', 'https://example.com/');
        self::assertSame([], $result);
    }

    // --- loadEntitySlugs ---

    public function testLoadEntitySlugsReturnsNullForMissingFile(): void
    {
        $config = ['nav_slug' => 'nonexistent', 'slugs_source' => 'items'];
        $result = $this->service->loadEntitySlugs(__DIR__ . '/../fixtures', 'ru', $config);
        self::assertNull($result);
    }

    public function testLoadEntitySlugsReturnsArrayFromDirectKey(): void
    {
        $dir = $this->createFixtureDir();
        file_put_contents($dir . '/ru/pages/products.json', '{"items":["slug-a","slug-b"]}');
        try {
            $config = ['nav_slug' => 'products', 'slugs_source' => 'items'];
            $result = $this->service->loadEntitySlugs($dir, 'ru', $config);
            self::assertSame(['slug-a', 'slug-b'], $result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    public function testLoadEntitySlugsFallsBackToSections(): void
    {
        $dir = $this->createFixtureDir();
        $json = json_encode([
            'sections' => [
                ['name' => 'articles', 'data' => ['items' => ['art-1', 'art-2']]]
            ]
        ]);
        file_put_contents($dir . '/ru/pages/articles.json', (string) $json);
        try {
            $config = ['nav_slug' => 'articles', 'slugs_source' => 'items'];
            $result = $this->service->loadEntitySlugs($dir, 'ru', $config);
            self::assertSame(['art-1', 'art-2'], $result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    public function testLoadEntitySlugsSupportsObjectSlugs(): void
    {
        $dir = $this->createFixtureDir();
        file_put_contents($dir . '/ru/pages/items.json', '{"items":[{"slug":"x"},{"slug":"y"}]}');
        try {
            $config = ['nav_slug' => 'items', 'slugs_source' => 'items'];
            $result = $this->service->loadEntitySlugs($dir, 'ru', $config);
            self::assertSame(['x', 'y'], $result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    public function testLoadEntitySlugsDeduplicates(): void
    {
        $dir = $this->createFixtureDir();
        file_put_contents($dir . '/ru/pages/dup.json', '{"items":["a","b","a"]}');
        try {
            $config = ['nav_slug' => 'dup', 'slugs_source' => 'items'];
            $result = $this->service->loadEntitySlugs($dir, 'ru', $config);
            self::assertSame(['a', 'b'], $result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    // --- loadEntity ---

    public function testLoadEntityReturnsNullForMissingFile(): void
    {
        $config = ['data_dir' => 'products', 'item_key' => 'item'];
        $result = $this->service->loadEntity(__DIR__ . '/../fixtures', 'ru', 'no-such', '', $config);
        self::assertNull($result);
    }

    public function testLoadEntityReturnsNullWhenItemKeyEmpty(): void
    {
        $dir = $this->createFixtureDir();
        @mkdir($dir . '/ru/products', 0755, true);
        file_put_contents($dir . '/ru/products/test.json', '{"other":{"name":"X"}}');
        try {
            $config = ['data_dir' => 'products', 'item_key' => 'item'];
            $result = $this->service->loadEntity($dir, 'ru', 'test', '', $config);
            self::assertNull($result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    public function testLoadEntityReturnsNullWhenNotVisible(): void
    {
        $dir = $this->createFixtureDir();
        @mkdir($dir . '/ru/products', 0755, true);
        file_put_contents($dir . '/ru/products/hidden.json', '{"item":{"name":"H"},"visible":false}');
        try {
            $config = ['data_dir' => 'products', 'item_key' => 'item'];
            $result = $this->service->loadEntity($dir, 'ru', 'hidden', '', $config);
            self::assertNull($result);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    public function testLoadEntitySetsSlugAndReturnsData(): void
    {
        $dir = $this->createFixtureDir();
        @mkdir($dir . '/ru/products', 0755, true);
        file_put_contents($dir . '/ru/products/my-item.json', '{"item":{"name":"My Item"},"visible":true}');
        try {
            $config = ['data_dir' => 'products', 'item_key' => 'item'];
            $result = $this->service->loadEntity($dir, 'ru', 'my-item', '', $config);
            self::assertIsArray($result);
            self::assertSame('my-item', $result['slug']);
            self::assertSame('My Item', $result['item']['name']);
        } finally {
            $this->cleanFixtureDir($dir);
        }
    }

    // --- loadEntitySlugs / loadEntity с реальными данными ---

    public function testLoadEntitySlugsWithRealTiresData(): void
    {
        $jsonBase = dirname(__DIR__, 2) . '/data/json';
        if (!is_file($jsonBase . '/ru/pages/tires.json')) {
            self::markTestSkipped('tires data not found');
        }
        $config = ['nav_slug' => 'tires', 'slugs_source' => 'items'];
        $result = $this->service->loadEntitySlugs($jsonBase, 'ru', $config);
        self::assertIsArray($result);
        self::assertNotEmpty($result);
        self::assertContains('at52', $result);
    }

    public function testLoadEntityWithRealTireData(): void
    {
        $jsonBase = dirname(__DIR__, 2) . '/data/json';
        if (!is_file($jsonBase . '/ru/tires/at52.json')) {
            self::markTestSkipped('tire at52 data not found');
        }
        $config = ['data_dir' => 'tires', 'item_key' => 'item'];
        $result = $this->service->loadEntity($jsonBase, 'ru', 'at52', '', $config);
        self::assertIsArray($result);
        self::assertSame('at52', $result['slug']);
        self::assertArrayHasKey('item', $result);
    }

    public function testLoadEntitySlugsWithRealNewsData(): void
    {
        $jsonBase = dirname(__DIR__, 2) . '/data/json';
        if (!is_file($jsonBase . '/ru/pages/news.json')) {
            self::markTestSkipped('news data not found');
        }
        $config = ['nav_slug' => 'news', 'slugs_source' => 'items'];
        $result = $this->service->loadEntitySlugs($jsonBase, 'ru', $config);
        self::assertIsArray($result);
        self::assertNotEmpty($result);
    }

    public function testLoadEntityWithRealNewsData(): void
    {
        $jsonBase = dirname(__DIR__, 2) . '/data/json';
        $newsDir = $jsonBase . '/ru/news';
        if (!is_dir($newsDir)) {
            self::markTestSkipped('news data dir not found');
        }
        $files = glob($newsDir . '/*.json');
        if ($files === false || $files === []) {
            self::markTestSkipped('no news files found');
        }
        $slug = basename($files[0], '.json');
        $config = ['data_dir' => 'news', 'item_key' => 'news'];
        $result = $this->service->loadEntity($jsonBase, 'ru', $slug, '', $config);
        self::assertIsArray($result);
        self::assertSame($slug, $result['slug']);
        self::assertArrayHasKey('news', $result);
    }

    // --- helpers ---

    private function createFixtureDir(): string
    {
        $dir = __DIR__ . '/../fixtures/json_entity_test_' . bin2hex(random_bytes(4));
        @mkdir($dir . '/ru/pages', 0755, true);
        return $dir;
    }

    private function cleanFixtureDir(string $dir): void
    {
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }
        @rmdir($dir);
    }

    private function getGlobalJsonPath(): string
    {
        return dirname(__DIR__, 2) . '/data/json/global.json';
    }
}
