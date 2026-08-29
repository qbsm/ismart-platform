<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\DefaultSeoBuilder;
use PHPUnit\Framework\TestCase;

final class DefaultSeoBuilderTest extends TestCase
{
    public function testEntityGetsOgUrl(): void
    {
        $meta = $this->build(
            ['slug' => 'wp52-plus', 'item' => ['name' => 'Модель']],
            ['item_key' => 'item', 'nav_slug' => 'tires']
        );

        self::assertSame('https://example.com/tires/wp52-plus', $meta['og:url'] ?? null);
    }

    public function testOgUrlSkippedWithoutNavSlug(): void
    {
        $meta = $this->build(
            ['slug' => 'wp52-plus', 'item' => ['name' => 'Модель']],
            ['item_key' => 'item']
        );

        self::assertArrayNotHasKey('og:url', $meta);
    }

    public function testOgUrlSkippedWithoutSlug(): void
    {
        $meta = $this->build(['item' => ['name' => 'Модель']], ['item_key' => 'item', 'nav_slug' => 'tires']);

        self::assertArrayNotHasKey('og:url', $meta);
    }

    /**
     * @param array<string,mixed> $entity
     * @param array<string,mixed> $config
     * @return array<string,string>
     */
    private function build(array $entity, array $config): array
    {
        $seo = new DefaultSeoBuilder()->build($entity, 'https://example.com/', 'ru', $config, []);

        $meta = [];
        foreach ($seo['meta'] as $tag) {
            if (isset($tag['property'])) {
                $meta[$tag['property']] = (string) $tag['content'];
            }
        }

        return $meta;
    }
}
