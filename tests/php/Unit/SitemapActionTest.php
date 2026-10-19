<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Action\SitemapAction;
use App\Service\DataLoaderService;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

final class SitemapActionTest extends TestCase
{
    private string $jsonBase;

    protected function setUp(): void
    {
        $this->jsonBase = sys_get_temp_dir() . '/sitemap-test-' . bin2hex(random_bytes(6));
        mkdir($this->jsonBase . '/ru/pages', 0o755, true);
    }

    protected function tearDown(): void
    {
        $this->removeDir($this->jsonBase);
    }

    private function removeDir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . '/' . $entry;
            is_dir($path) ? $this->removeDir($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    /** @param array<string, mixed> $settings */
    private function render(array $settings): string
    {
        $action = new SitemapAction($settings, new DataLoaderService());
        $request = new ServerRequestFactory()->createServerRequest('GET', 'https://example.com/sitemap.xml');
        $response = $action($request, new ResponseFactory()->createResponse());
        $response->getBody()->rewind();

        return $response->getBody()->getContents();
    }

    /** @param array<string, mixed> $extra */
    private function settings(array $extra = []): array
    {
        return array_merge([
            'default_lang' => 'ru',
            'available_langs' => ['ru'],
            'route_map' => ['restaurants' => 'restaurants-list'],
            'sitemap_pages' => ['index', 'restaurants-list'],
            'paths' => ['json_base' => $this->jsonBase],
        ], $extra);
    }

    /** @param array<string, mixed> $collection */
    private function collection(array $collection = []): array
    {
        return ['restaurants' => array_merge([
            'nav_slug' => 'restaurants',
            'slugs_source' => 'items',
        ], $collection)];
    }

    public function testСущностиКоллекцииПопадаютВSitemap(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['items' => ['hitch', 'bist']])
        );

        $xml = $this->render($this->settings(['collections' => $this->collection()]));

        self::assertStringContainsString('<loc>https://example.com/restaurants/hitch</loc>', $xml);
        self::assertStringContainsString('<loc>https://example.com/restaurants/bist</loc>', $xml);
        self::assertStringContainsString('<loc>https://example.com/restaurants</loc>', $xml);
        self::assertStringContainsString('<loc>https://example.com/</loc>', $xml);
    }

    public function testSlugБерётсяИзОбъектаСПолемSlug(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['items' => [['slug' => 'jam-cafe', 'title' => 'Джем кафе']]])
        );

        $xml = $this->render($this->settings(['collections' => $this->collection()]));

        self::assertStringContainsString('<loc>https://example.com/restaurants/jam-cafe</loc>', $xml);
    }

    public function testSlugИщетсяВСекцииКогдаПрямогоКлючаНет(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['sections' => [['name' => 'restaurants', 'data' => ['items' => ['bear']]]]])
        );

        $xml = $this->render($this->settings(['collections' => $this->collection()]));

        self::assertStringContainsString('<loc>https://example.com/restaurants/bear</loc>', $xml);
    }

    public function testБезДанныхКоллекцииSitemapНеЛомается(): void
    {
        $xml = $this->render($this->settings(['collections' => $this->collection()]));

        self::assertStringContainsString('<loc>https://example.com/</loc>', $xml);
        self::assertStringNotContainsString('/restaurants/', $xml);
    }

    public function testАдресаНеДублируются(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['items' => ['hitch', 'hitch']])
        );

        $xml = $this->render($this->settings(['collections' => $this->collection()]));

        self::assertSame(1, substr_count($xml, '<loc>https://example.com/restaurants/hitch</loc>'));
    }

    public function testКоллекциюМожноСкрытьИзSitemap(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['items' => ['hitch']])
        );

        $xml = $this->render($this->settings([
            'collections' => $this->collection(['sitemap' => false]),
        ]));

        self::assertStringNotContainsString('/restaurants/hitch', $xml);
        self::assertStringContainsString('<loc>https://example.com/restaurants</loc>', $xml);
    }

    public function testВторойЯзыкПолучаетСвойПрефиксИAlternate(): void
    {
        file_put_contents(
            $this->jsonBase . '/ru/pages/restaurants.json',
            json_encode(['items' => ['hitch']])
        );

        $xml = $this->render($this->settings([
            'available_langs' => ['ru', 'en'],
            'collections' => $this->collection(),
        ]));

        self::assertStringContainsString('<loc>https://example.com/restaurants/hitch</loc>', $xml);
        self::assertStringContainsString('<loc>https://example.com/en/restaurants/hitch</loc>', $xml);
        self::assertStringContainsString(
            '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/restaurants/hitch"/>',
            $xml
        );
    }
}
