<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\Env;
use PHPUnit\Framework\TestCase;

final class EnvTest extends TestCase
{
    private const NAME = 'ISMART_TEST_FLAG';

    protected function tearDown(): void
    {
        putenv(self::NAME);
    }

    public function testMissingVariableKeepsDefaultOn(): void
    {
        putenv(self::NAME);

        self::assertTrue(Env::bool(self::NAME, true));
    }

    public function testEmptyVariableKeepsDefaultOn(): void
    {
        putenv(self::NAME . '=');

        self::assertTrue(Env::bool(self::NAME, true));
    }

    public function testExplicitFalseOverridesDefault(): void
    {
        putenv(self::NAME . '=false');

        self::assertFalse(Env::bool(self::NAME, true));
    }

    public function testExplicitTrueOverridesDefault(): void
    {
        putenv(self::NAME . '=yes');

        self::assertTrue(Env::bool(self::NAME));
    }

    public function testMissingVariableWithoutDefaultIsFalse(): void
    {
        putenv(self::NAME);

        self::assertFalse(Env::bool(self::NAME));
    }
}
