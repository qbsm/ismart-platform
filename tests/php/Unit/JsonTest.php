<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\Json;
use PHPUnit\Framework\TestCase;

final class JsonTest extends TestCase
{
    /** @var list<string> */
    private array $tempFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->tempFiles as $f) {
            @unlink($f);
        }
        $this->tempFiles = [];
    }

    private function writeTempJson(string $contents): string
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'json-test-');
        file_put_contents($path, $contents);
        $this->tempFiles[] = $path;
        return $path;
    }

    public function testLoadReturnsArrayForValidJson(): void
    {
        $path = $this->writeTempJson('{"a": 1, "b": "x"}');
        self::assertSame(['a' => 1, 'b' => 'x'], Json::load($path));
    }

    public function testLoadReturnsArrayForJsonArray(): void
    {
        $path = $this->writeTempJson('[1, 2, 3]');
        self::assertSame([1, 2, 3], Json::load($path));
    }

    public function testLoadReturnsNullForMissingFile(): void
    {
        self::assertNull(Json::load('/nonexistent/path-' . uniqid() . '.json'));
    }

    public function testLoadReturnsNullForInvalidJson(): void
    {
        $path = $this->writeTempJson('{not valid json');
        self::assertNull(Json::load($path));
    }

    public function testLoadReturnsNullForScalarJson(): void
    {
        $path = $this->writeTempJson('42');
        self::assertNull(Json::load($path));
    }

    public function testLoadKeyReturnsArrayForExistingKey(): void
    {
        $path = $this->writeTempJson('{"items": [{"a": 1}, {"a": 2}]}');
        self::assertSame([['a' => 1], ['a' => 2]], Json::loadKey($path, 'items'));
    }

    public function testLoadKeyReturnsNullForMissingKey(): void
    {
        $path = $this->writeTempJson('{"other": []}');
        self::assertNull(Json::loadKey($path, 'items'));
    }

    public function testLoadKeyReturnsNullForNonArrayValue(): void
    {
        $path = $this->writeTempJson('{"items": "not array"}');
        self::assertNull(Json::loadKey($path, 'items'));
    }

    public function testLoadKeyReturnsNullForMissingFile(): void
    {
        self::assertNull(Json::loadKey('/nonexistent/x-' . uniqid() . '.json', 'items'));
    }
}
