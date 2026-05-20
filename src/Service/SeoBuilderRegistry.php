<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Реестр SEO-builder'ов по типу коллекции.
 *
 * Регистрируется в DI (config/container.php) с явным списком builder'ов.
 * Получение builder'а в PageAction — через Registry, не через service-locator.
 *
 * Если builder для коллекции не зарегистрирован — Registry возвращает $default
 * (обычно DefaultSeoBuilder с generic-логикой item.name + desc.short).
 */
final class SeoBuilderRegistry
{
    /**
     * @param array<string, SeoBuilderInterface> $builders Карта entityType → SeoBuilderInterface
     * @param SeoBuilderInterface|null           $default  Fallback-builder (если type не найден)
     */
    public function __construct(
        private array $builders = [],
        private ?SeoBuilderInterface $default = null,
    ) {
    }

    /**
     * Возвращает builder для коллекции или $default (если зарегистрирован), либо null.
     */
    public function get(string $type): ?SeoBuilderInterface
    {
        return $this->builders[$type] ?? $this->default;
    }
}
