<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\Phone;
use PHPUnit\Framework\TestCase;

final class PhoneTest extends TestCase
{
    public function testRussianDigitsGetHumanFormat(): void
    {
        self::assertSame('+7 (965) 728-42-77', Phone::format('79657284277'));
    }

    public function testLeadingEightBecomesSeven(): void
    {
        self::assertSame('+7 (965) 728-42-77', Phone::format('89657284277'));
    }

    public function testAlreadyFormattedStaysTheSame(): void
    {
        self::assertSame('+7 (965) 728-42-77', Phone::format('+7 (965) 728-42-77'));
    }

    public function testForeignNumberKeepsPlainDigits(): void
    {
        self::assertSame('+393331234567', Phone::format('+39 333 123 45 67'));
    }

    public function testEmptyValueSurvives(): void
    {
        self::assertSame('', Phone::format(''));
    }
}
