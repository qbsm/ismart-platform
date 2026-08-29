<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\LanguageService;
use PHPUnit\Framework\TestCase;

final class LanguageServiceTest extends TestCase
{
    private LanguageService $service;

    private array $supportedLanguages = [
        'ru' => ['code' => 'ru', 'title' => 'Русский'],
        'en' => ['code' => 'en', 'title' => 'English'],
    ];

    protected function setUp(): void
    {
        $this->service = new LanguageService();
    }

    public function testDetectUsesDefaultWhenSegmentsEmpty(): void
    {
        $result = $this->service->detect([], $this->supportedLanguages, 'ru');
        self::assertSame('ru', $result['lang_code']);
        self::assertSame($this->supportedLanguages['ru'], $result['current_lang']);
        self::assertFalse($result['is_lang_in_url']);
        self::assertSame([], $result['segments']);
    }

    public function testDetectUsesDefaultWhenFirstSegmentNotSupported(): void
    {
        $result = $this->service->detect(['contacts'], $this->supportedLanguages, 'ru');
        self::assertSame('ru', $result['lang_code']);
        self::assertFalse($result['is_lang_in_url']);
        self::assertSame(['contacts'], $result['segments']);
    }

    public function testDetectUsesLangFromUrlWhenFirstSegmentIsSupported(): void
    {
        $result = $this->service->detect(['en', 'contacts'], $this->supportedLanguages, 'ru');
        self::assertSame('en', $result['lang_code']);
        self::assertSame($this->supportedLanguages['en'], $result['current_lang']);
        self::assertTrue($result['is_lang_in_url']);
        self::assertSame(['contacts'], $result['segments']);
    }

    public function testDetectStripsLangFromSegments(): void
    {
        $result = $this->service->detect(['ru', 'page', 'slug'], $this->supportedLanguages, 'en');
        self::assertSame('ru', $result['lang_code']);
        self::assertSame(['page', 'slug'], $result['segments']);
    }
}
