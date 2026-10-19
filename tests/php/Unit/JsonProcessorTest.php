<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Support\JsonProcessor;
use PHPUnit\Framework\TestCase;

final class JsonProcessorTest extends TestCase
{
    public function testLeavesAbsoluteUrlsUnchanged(): void
    {
        $data = ['url' => 'https://example.com/path'];
        JsonProcessor::processJsonPaths($data, 'https://site.com/');
        self::assertSame('https://example.com/path', $data['url']);
    }

    public function testConvertsDataPathToAbsolute(): void
    {
        $data = ['img' => 'data/img/logo.png'];
        JsonProcessor::processJsonPaths($data, 'https://example.com/');
        self::assertSame('https://example.com/data/img/logo.png', $data['img']);
    }

    public function testConvertsSlashDataPathToAbsolute(): void
    {
        $data = ['img' => '/data/img/logo.png'];
        JsonProcessor::processJsonPaths($data, 'https://example.com/');
        self::assertSame('https://example.com/data/img/logo.png', $data['img']);
    }

    public function testProcessesNestedArrays(): void
    {
        $data = ['level' => ['img' => 'data/img/nested.png']];
        JsonProcessor::processJsonPaths($data, 'https://example.com/');
        self::assertSame('https://example.com/data/img/nested.png', $data['level']['img']);
    }

    public function testNormalizesBaseUrlTrailingSlash(): void
    {
        $data = ['img' => 'data/img/x.png'];
        JsonProcessor::processJsonPaths($data, 'https://example.com');
        self::assertSame('https://example.com/data/img/x.png', $data['img']);
    }
}
