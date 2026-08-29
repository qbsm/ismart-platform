<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\TemplateDataBuilder;
use PHPUnit\Framework\TestCase;

final class TemplateDataBuilderTest extends TestCase
{
    private TemplateDataBuilder $builder;

    private array $settings;

    protected function setUp(): void
    {
        $this->builder = new TemplateDataBuilder();
        $this->settings = [
            'project_root' => dirname(__DIR__, 2),
            'paths' => [],
        ];
    }

    public function testBuildIncludesSettingsAndConfig(): void
    {
        $data = $this->builder->build($this->settings, [], null, null, ['base_url' => '/'], []);
        self::assertSame($this->settings, $data['settings']);
        self::assertSame($this->settings, $data['config']['settings']);
    }

    public function testBuildPassesContextToTemplateData(): void
    {
        $ctx = [
            'lang_code' => 'en',
            'page_id' => 'contacts',
            'base_url' => 'https://example.com/',
            'is_lang_in_url' => true,
            'route_params' => [],
        ];
        $data = $this->builder->build($this->settings, [], null, null, $ctx, []);
        self::assertSame('en', $data['lang_code']);
        self::assertSame('contacts', $data['page_id']);
        self::assertSame('https://example.com/', $data['base_url']);
        self::assertTrue($data['is_lang_in_url']);
    }

    public function testBuildUsesSeoTitleWhenPresent(): void
    {
        $seo = ['title' => 'SEO Title'];
        $pageData = ['title' => 'Page Title'];
        $data = $this->builder->build($this->settings, [], $pageData, $seo, ['base_url' => '/'], []);
        self::assertSame('SEO Title', $data['pageTitle']);
    }

    public function testBuildFallsBackToPageTitleWhenNoSeo(): void
    {
        $pageData = ['title' => 'Page Title'];
        $data = $this->builder->build($this->settings, [], $pageData, null, ['base_url' => '/'], []);
        self::assertSame('Page Title', $data['pageTitle']);
    }

    public function testBuildExtractsSectionsFromPageData(): void
    {
        $sections = [['name' => 'intro'], ['name' => 'footer']];
        $pageData = ['sections' => $sections];
        $data = $this->builder->build($this->settings, [], $pageData, null, ['base_url' => '/'], []);
        self::assertSame($sections, $data['sections']);
    }

    public function testBuildMergesExtras(): void
    {
        $data = $this->builder->build($this->settings, [], null, null, ['base_url' => '/'], ['custom' => 'value']);
        self::assertSame('value', $data['custom']);
    }
}
