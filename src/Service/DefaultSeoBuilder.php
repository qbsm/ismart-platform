<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Generic SEO-builder для коллекций без специфической Schema.org/JSON-LD логики.
 *
 * Использует item-обёртку из конфига коллекции (item_key) для извлечения name/title и desc.
 * Эта реализация воспроизводит поведение, которое раньше было inline в PageAction::buildSeoForEntity().
 *
 * Регистрируется как default в SeoBuilderRegistry. Если у коллекции нет специфичного builder'а —
 * вызывается этот.
 */
final class DefaultSeoBuilder implements SeoBuilderInterface
{
    public function build(array $entity, string $baseUrl, string $langCode, array $config, array $global): array
    {
        $itemKey = (string) ($config['item_key'] ?? '');
        $ogType = (string) ($config['og_type'] ?? 'website');
        $siteName = (string) ($global['name'] ?? $global['site_name'] ?? '');

        $inner = $itemKey !== '' ? ($entity[$itemKey] ?? []) : $entity;
        $name = (string) ($inner['name'] ?? $inner['title'] ?? $entity['slug'] ?? '');
        $desc = (string) (
            $entity['desc']['short']
            ?? $entity['desc']['full']
            ?? $inner['desc']
            ?? $inner['lead']
            ?? ''
        );

        $ogImage = rtrim($baseUrl, '/') . '/data/img/seo/og.webp?v=2';

        $meta = [
            ['name' => 'description', 'content' => $desc],
            ['property' => 'og:type', 'content' => $ogType],
            ['property' => 'og:title', 'content' => $name],
            ['property' => 'og:description', 'content' => $desc],
            ['property' => 'og:image', 'content' => $ogImage],
        ];

        if ($siteName !== '') {
            $meta[] = ['property' => 'og:site_name', 'content' => $siteName];
        }

        return [
            'title' => $name,
            'meta' => $meta,
            'json_ld' => null,
            'json_ld_faq' => null,
        ];
    }
}
