<?php

declare(strict_types=1);

namespace App\Event;

/**
 * Событие: сущность коллекции найдена и загружена.
 *
 * Диспатчится после успешного loadEntity, до построения SEO и рендеринга.
 */
final class EntityResolved
{
    /**
     * @param string             $entityType Тип коллекции (tires, news, products и т.д.)
     * @param string             $slug       Slug сущности
     * @param array<string,mixed> $entity     Данные сущности (включая slug, item, visible)
     * @param array<string,mixed> $config     Конфигурация коллекции из settings
     */
    public function __construct(
        public readonly string $entityType,
        public readonly string $slug,
        public readonly array $entity,
        public readonly array $config,
    ) {}
}
