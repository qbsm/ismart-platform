<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Service\SeoService;
use PHPUnit\Framework\TestCase;
use Twig\Environment;
use Twig\Loader\ArrayLoader;

final class SeoServiceTest extends TestCase
{
    private SeoService $service;

    private Environment $twig;

    protected function setUp(): void
    {
        $this->twig = new Environment(new ArrayLoader([]));
        $this->service = new SeoService();
    }

    public function testProcessTemplatesReturnsNullForNullInput(): void
    {
        $result = $this->service->processTemplates(null, [], $this->twig);
        self::assertNull($result);
    }

    public function testProcessTemplatesRendersStringWithTwig(): void
    {
        $seoData = ['title' => '{{ lang_code }}'];
        $context = ['lang_code' => 'ru'];
        $result = $this->service->processTemplates($seoData, $context, $this->twig);
        self::assertIsArray($result);
        self::assertSame('ru', $result['title']);
    }

    public function testProcessTemplatesProcessesNestedArrays(): void
    {
        $seoData = ['meta' => ['description' => '{{ pageData.name }}']];
        $context = ['pageData' => ['name' => 'index']];
        $result = $this->service->processTemplates($seoData, $context, $this->twig);
        self::assertSame('index', $result['meta']['description']);
    }

    public function testProcessTemplatesLeavesNonStringsUnchanged(): void
    {
        $seoData = ['count' => 42, 'active' => true];
        $result = $this->service->processTemplates($seoData, [], $this->twig);
        self::assertSame(42, $result['count']);
        self::assertTrue($result['active']);
    }
}
