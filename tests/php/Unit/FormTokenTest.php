<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\FormToken;
use PHPUnit\Framework\TestCase;

final class FormTokenTest extends TestCase
{
    private const SECRET = 'secret-for-tests';

    public function testTokenIssuedAndAcceptedAfterMinAge(): void
    {
        $token = new FormToken(self::SECRET, 3);
        $issued = $token->issue(1_000_000);

        self::assertTrue($token->inspect($issued, 1_000_004)['valid']);
    }

    public function testInstantSubmissionRejected(): void
    {
        $token = new FormToken(self::SECRET, 3);
        $issued = $token->issue(1_000_000);
        $verdict = $token->inspect($issued, 1_000_001);

        self::assertFalse($verdict['valid']);
        self::assertSame('too_fast', $verdict['reason']);
    }

    public function testForgedSignatureRejected(): void
    {
        $token = new FormToken(self::SECRET, 3);
        $verdict = $token->inspect('1000000.' . str_repeat('a', 32), 1_000_010);

        self::assertFalse($verdict['valid']);
        self::assertSame('signature', $verdict['reason']);
    }

    public function testTokenFromAnotherSiteRejected(): void
    {
        $ours = new FormToken(self::SECRET, 3);
        $theirs = new FormToken('another-secret', 3);

        $verdict = $ours->inspect($theirs->issue(1_000_000), 1_000_010);

        self::assertFalse($verdict['valid']);
        self::assertSame('signature', $verdict['reason']);
    }

    public function testExpiredTokenRejected(): void
    {
        $token = new FormToken(self::SECRET, 3, 7200);
        $verdict = $token->inspect($token->issue(1_000_000), 1_010_000);

        self::assertFalse($verdict['valid']);
        self::assertSame('expired', $verdict['reason']);
    }

    public function testMalformedTokenRejected(): void
    {
        $token = new FormToken(self::SECRET, 3);

        self::assertSame('malformed', $token->inspect('', 1_000_000)['reason']);
        self::assertSame('malformed', $token->inspect('нет-точки', 1_000_000)['reason']);
        self::assertSame('malformed', $token->inspect('abc.def', 1_000_000)['reason']);
    }

    /**
     * Часы на сервере могут уехать назад; токен «из будущего» — не повод принимать заявку,
     * но и не повод падать.
     */
    public function testTokenFromFutureRejected(): void
    {
        $token = new FormToken(self::SECRET, 3);
        $verdict = $token->inspect($token->issue(1_000_100), 1_000_000);

        self::assertFalse($verdict['valid']);
        self::assertSame('expired', $verdict['reason']);
    }
}
