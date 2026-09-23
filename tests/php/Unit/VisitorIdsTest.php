<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\VisitorIds;
use PHPUnit\Framework\TestCase;

final class VisitorIdsTest extends TestCase
{
    public function testTakesCallTouchVisitorAndGaClientId(): void
    {
        self::assertSame(
            ['ct_client_id' => 'abc123', 'ga_client_id' => '1234567890.1690000000'],
            VisitorIds::fromCookies([
                '_ct_client_global_id' => 'abc123',
                '_ga' => 'GA1.1.1234567890.1690000000',
            ]),
        );
    }

    public function testSkipsMissingAndEmptyCookies(): void
    {
        self::assertSame([], VisitorIds::fromCookies([]));
        self::assertSame([], VisitorIds::fromCookies(['_ga' => '', '_ct_client_global_id' => '   ']));
        self::assertSame([], VisitorIds::fromCookies(['_ga' => 42]));
    }

    /** Префикс версии и типа счётчика к идентификатору не относится: `GA1.2.` у поддомена. */
    public function testStripsGaPrefixForAnyCounterVariant(): void
    {
        self::assertSame('999.111', VisitorIds::gaClientId('GA1.2.999.111'));
        self::assertSame('999.111', VisitorIds::gaClientId('GA2.3.999.111'));
        self::assertSame('999.111', VisitorIds::gaClientId('999.111'));
        self::assertSame('', VisitorIds::gaClientId(''));
    }

    /** Поле формы заполнено осознанно, кука — догадка сервера: затирать нельзя. */
    public function testFormValueWins(): void
    {
        $data = VisitorIds::enrich(
            ['ct_client_id' => 'из формы'],
            ['_ct_client_global_id' => 'из куки', '_ga' => 'GA1.1.5.6'],
        );

        self::assertSame('из формы', $data['ct_client_id']);
        self::assertSame('5.6', $data['ga_client_id']);
    }
}
