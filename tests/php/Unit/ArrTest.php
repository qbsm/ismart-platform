<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\Arr;
use PHPUnit\Framework\TestCase;

final class ArrTest extends TestCase
{
    public function testStrReturnsTrimmedStringForStringValue(): void
    {
        self::assertSame('hello', Arr::str(['name' => '  hello  '], 'name'));
    }

    public function testStrReturnsEmptyForMissingKey(): void
    {
        self::assertSame('', Arr::str(['other' => 'x'], 'name'));
    }

    public function testStrReturnsEmptyForNonStringValue(): void
    {
        self::assertSame('', Arr::str(['n' => 42], 'n'));
        self::assertSame('', Arr::str(['n' => null], 'n'));
        self::assertSame('', Arr::str(['n' => ['x']], 'n'));
    }

    public function testIntReturnsIntForIntValue(): void
    {
        self::assertSame(42, Arr::int(['x' => 42], 'x'));
    }

    public function testIntReturnsIntForNumericString(): void
    {
        self::assertSame(7, Arr::int(['x' => '7'], 'x'));
        self::assertSame(0, Arr::int(['x' => '0'], 'x'));
    }

    public function testIntReturnsZeroForNonNumeric(): void
    {
        self::assertSame(0, Arr::int(['x' => 'abc'], 'x'));
        self::assertSame(0, Arr::int(['x' => null], 'x'));
        self::assertSame(0, Arr::int([], 'x'));
    }

    public function testBoolReturnsTrueForTruthyVariants(): void
    {
        self::assertTrue(Arr::bool(['ok' => true], 'ok'));
        self::assertTrue(Arr::bool(['ok' => 1], 'ok'));
        self::assertTrue(Arr::bool(['ok' => '1'], 'ok'));
        self::assertTrue(Arr::bool(['ok' => 'true'], 'ok'));
    }

    public function testBoolReturnsFalseForOtherValues(): void
    {
        self::assertFalse(Arr::bool(['ok' => false], 'ok'));
        self::assertFalse(Arr::bool(['ok' => 0], 'ok'));
        self::assertFalse(Arr::bool(['ok' => 'yes'], 'ok'));
        self::assertFalse(Arr::bool(['ok' => null], 'ok'));
        self::assertFalse(Arr::bool([], 'ok'));
    }

    public function testArrayReturnsArrayValue(): void
    {
        self::assertSame([1, 2], Arr::array(['list' => [1, 2]], 'list'));
    }

    public function testArrayReturnsEmptyForNonArray(): void
    {
        self::assertSame([], Arr::array(['list' => 'x'], 'list'));
        self::assertSame([], Arr::array([], 'list'));
    }
}
