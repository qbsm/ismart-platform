<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\PlatformSettings;
use PHPUnit\Framework\TestCase;

final class PlatformSettingsTest extends TestCase
{
    public function testDefaultLangReturnsValueIfSet(): void
    {
        self::assertSame('en', PlatformSettings::defaultLang(['default_lang' => 'en']));
    }

    public function testDefaultLangFallsBackToRu(): void
    {
        self::assertSame('ru', PlatformSettings::defaultLang([]));
    }

    public function testAvailableLangsReturnsArrayOfStrings(): void
    {
        self::assertSame(['ru', 'en'], PlatformSettings::availableLangs(['available_langs' => ['ru', 'en']]));
    }

    public function testAvailableLangsFallsBackToRu(): void
    {
        self::assertSame(['ru'], PlatformSettings::availableLangs([]));
    }

    public function testAvailableLangsCoercesNonStringValues(): void
    {
        self::assertSame(['ru', 'en', '42'], PlatformSettings::availableLangs(['available_langs' => ['ru', 'en', 42]]));
    }

    public function testAvailableLangsHandlesNonArrayGracefully(): void
    {
        self::assertSame(['ru'], PlatformSettings::availableLangs(['available_langs' => 'not-array']));
    }

    public function testRouteMapReturnsArray(): void
    {
        $map = ['tires' => 'tires-list', 'news' => 'news'];
        self::assertSame($map, PlatformSettings::routeMap(['route_map' => $map]));
    }

    public function testRouteMapReturnsEmptyArrayWhenMissing(): void
    {
        self::assertSame([], PlatformSettings::routeMap([]));
        self::assertSame([], PlatformSettings::routeMap(['route_map' => 'not-array']));
    }

    public function testCollectionsReturnsAssocArray(): void
    {
        $collections = ['tires' => ['nav_slug' => 'tires', 'item_key' => 'item']];
        self::assertSame($collections, PlatformSettings::collections(['collections' => $collections]));
    }

    public function testCollectionsReturnsEmptyArrayWhenMissing(): void
    {
        self::assertSame([], PlatformSettings::collections([]));
        self::assertSame([], PlatformSettings::collections(['collections' => null]));
    }
}
