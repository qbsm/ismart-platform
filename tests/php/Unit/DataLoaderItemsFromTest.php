<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\DataLoaderService;
use PHPUnit\Framework\TestCase;

/**
 * Тесты для ADR-0004 `data.items_from` — декларативная инжекция items коллекций в любые секции страницы.
 */
final class DataLoaderItemsFromTest extends TestCase
{
    private DataLoaderService $service;
    private string $tmpDir;

    protected function setUp(): void
    {
        $this->service = new DataLoaderService();
        $this->tmpDir = sys_get_temp_dir() . '/ismart_items_from_' . bin2hex(random_bytes(4));
        @mkdir($this->tmpDir . '/ru/pages', 0o755, true);
        @mkdir($this->tmpDir . '/ru/news', 0o755, true);
    }

    protected function tearDown(): void
    {
        $this->cleanDir($this->tmpDir);
    }

    public function testInjectItemsFromResolvesCollectionWithDeclaredOrder(): void
    {
        file_put_contents(
            $this->tmpDir . '/ru/pages/news.json',
            json_encode(['items' => ['third', 'first', 'second']]) ?: '{}'
        );
        foreach (['first', 'second', 'third'] as $slug) {
            file_put_contents(
                $this->tmpDir . '/ru/news/' . $slug . '.json',
                json_encode(['news' => ['title' => ucfirst($slug)]]) ?: '{}'
            );
        }

        $pageData = [
            'sections' => [
                ['name' => 'news-slider', 'data' => ['items_from' => 'news']],
            ],
        ];
        $collections = [
            'news' => [
                'nav_slug' => 'news',
                'data_dir' => 'news',
                'item_key' => 'news',
                'slugs_source' => 'items',
            ],
        ];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', 'https://example.com/');

        $items = $pageData['sections'][0]['data']['items'];
        self::assertCount(3, $items);
        self::assertSame(['third', 'first', 'second'], array_column($items, 'slug'));
    }

    public function testInjectItemsFromDoesNotOverrideExistingItems(): void
    {
        $pageData = [
            'sections' => [
                [
                    'name' => 'news-slider',
                    'data' => [
                        'items_from' => 'news',
                        'items' => [['slug' => 'pre-existing', 'title' => 'Inline']],
                    ],
                ],
            ],
        ];
        $collections = [
            'news' => [
                'nav_slug' => 'news',
                'data_dir' => 'news',
                'item_key' => 'news',
            ],
        ];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', '');

        self::assertSame(
            [['slug' => 'pre-existing', 'title' => 'Inline']],
            $pageData['sections'][0]['data']['items']
        );
    }

    public function testInjectItemsFromFallsBackToDirectoryScanWithNaturalSort(): void
    {
        @mkdir($this->tmpDir . '/ru/management', 0o755, true);
        foreach (['1', '10', '2'] as $slug) {
            file_put_contents(
                $this->tmpDir . '/ru/management/' . $slug . '.json',
                json_encode(['manager' => ['name' => 'Person ' . $slug]]) ?: '{}'
            );
        }

        $pageData = [
            'sections' => [
                ['name' => 'management', 'data' => ['items_from' => 'management']],
            ],
        ];
        $collections = [
            'management' => [
                'nav_slug' => 'management',
                'data_dir' => 'management',
                'item_key' => 'manager',
            ],
        ];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', '');

        self::assertSame(
            ['1', '2', '10'],
            array_column($pageData['sections'][0]['data']['items'], 'slug')
        );
    }

    public function testInjectItemsFromAppliesLimit(): void
    {
        file_put_contents(
            $this->tmpDir . '/ru/pages/news.json',
            json_encode(['items' => ['a', 'b', 'c', 'd', 'e']]) ?: '{}'
        );
        foreach (['a', 'b', 'c', 'd', 'e'] as $slug) {
            file_put_contents(
                $this->tmpDir . '/ru/news/' . $slug . '.json',
                json_encode(['news' => ['title' => strtoupper($slug)]]) ?: '{}'
            );
        }

        $pageData = [
            'sections' => [
                ['name' => 'news-slider', 'data' => ['items_from' => 'news', 'limit' => 2]],
            ],
        ];
        $collections = [
            'news' => [
                'nav_slug' => 'news',
                'data_dir' => 'news',
                'item_key' => 'news',
                'slugs_source' => 'items',
            ],
        ];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', '');

        $items = $pageData['sections'][0]['data']['items'];
        self::assertCount(2, $items);
        self::assertSame(['a', 'b'], array_column($items, 'slug'));
    }

    public function testInjectItemsFromResolvesByNavSlugWhenKeyDiffers(): void
    {
        file_put_contents(
            $this->tmpDir . '/ru/pages/news.json',
            json_encode(['items' => ['only-one']]) ?: '{}'
        );
        file_put_contents(
            $this->tmpDir . '/ru/news/only-one.json',
            json_encode(['news' => ['title' => 'Only One']]) ?: '{}'
        );

        $pageData = [
            'sections' => [
                ['data' => ['items_from' => 'news']],
            ],
        ];
        // Ключ коллекции отличается от nav_slug — должен зарезолвиться по nav_slug.
        $collections = [
            'news_collection' => [
                'nav_slug' => 'news',
                'data_dir' => 'news',
                'item_key' => 'news',
                'slugs_source' => 'items',
            ],
        ];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', '');

        self::assertSame('only-one', $pageData['sections'][0]['data']['items'][0]['slug']);
    }

    public function testInjectItemsFromIgnoresSectionsWithoutItemsFrom(): void
    {
        $pageData = [
            'sections' => [
                ['name' => 'hero', 'data' => ['title' => 'Hero']],
            ],
        ];
        $collections = ['news' => ['nav_slug' => 'news', 'data_dir' => 'news', 'item_key' => 'news']];

        $this->service->injectItemsFrom($pageData, $collections, $this->tmpDir, 'ru', '');

        self::assertSame(['title' => 'Hero'], $pageData['sections'][0]['data']);
    }

    public function testScanCollectionSlugsReturnsEmptyForMissingDir(): void
    {
        $result = $this->service->scanCollectionSlugs($this->tmpDir, 'ru', ['data_dir' => 'nonexistent']);
        self::assertSame([], $result);
    }

    private function cleanDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
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
}
