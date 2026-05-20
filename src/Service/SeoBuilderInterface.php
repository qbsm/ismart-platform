<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Контракт построителя SEO-данных для конкретной коллекции сущностей.
 *
 * Реализации регистрируются в SeoBuilderRegistry по имени коллекции (`tires`, `news`, `restaurants`).
 * PageAction достаёт нужный builder через Registry и вызывает build() для entity-страниц.
 * Если builder для коллекции не зарегистрирован — используется DefaultSeoBuilder (generic).
 *
 * Возвращаемый формат — тот же что у data/json/{lang}/seo/{page}.json:
 * {title: string, meta: [{name|property, content}], json_ld?: array, json_ld_faq?: array}.
 */
interface SeoBuilderInterface
{
    /**
     * @param array<string,mixed> $entity   Загруженная сущность (с ключом slug)
     * @param string              $baseUrl  Базовый URL текущего окружения
     * @param string              $langCode Код языка (ru, en, ...)
     * @param array<string,mixed> $config   Конфиг коллекции из settings (item_key, og_type, ...)
     * @param array<string,mixed> $global   global.json (для site-wide данных)
     * @return array<string,mixed>         SEO-данные (title, meta, json_ld)
     */
    public function build(array $entity, string $baseUrl, string $langCode, array $config, array $global): array;
}
