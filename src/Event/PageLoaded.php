<?php

declare(strict_types=1);

namespace App\Event;

/**
 * Событие: страница загружена и готова к рендерингу.
 *
 * Диспатчится после определения pageId, загрузки pageData и установки HTTP-статуса.
 */
final class PageLoaded
{
    /**
     * @param string             $pageId   Идентификатор страницы (index, 404, tires-list и т.д.)
     * @param string             $langCode Код языка (ru, en)
     * @param array<string,mixed> $pageData Данные страницы (sections, items)
     * @param int                $status   HTTP-статус (200, 404)
     */
    public function __construct(
        public readonly string $pageId,
        public readonly string $langCode,
        public readonly array $pageData,
        public readonly int $status,
    ) {}
}
