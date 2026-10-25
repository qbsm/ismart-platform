<?php

declare(strict_types=1);

namespace App\Event;

/**
 * Событие: SEO-данные сформированы.
 *
 * Диспатчится после построения финальных seoData (из файла или из entity).
 */
final class SeoBuilt
{
    /**
     * @param string             $pageId   Идентификатор страницы или slug сущности
     * @param array<string,mixed> $seoData  Финальные SEO-данные (title, meta, json_ld)
     * @param bool               $isEntity true если SEO построено для entity, false для обычной страницы
     */
    public function __construct(
        public readonly string $pageId,
        public readonly array $seoData,
        public readonly bool $isEntity,
    ) {}
}
