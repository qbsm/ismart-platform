<?php

declare(strict_types=1);

/**
 * Конфигурация генератора llms-full.txt (GEO).
 *
 * Описывает коллекции контента: откуда брать список slug'ов и как форматировать
 * каждый элемент для AI-краулеров (Perplexity, ChatGPT, Claude и т.д.).
 *
 * Этот файл — TEMPLATE (.dist). Для нового deployment'а:
 *   cp config/llms-full.php.dist config/llms-full.php
 * и заполнить под свои коллекции (товары/услуги/рестораны/новости/...).
 *
 * @return array{title: string, intro: string, collections: array<int, array{list_path: string, list_key: string, item_dir: string, name_key: string, desc_key?: string, visible_key?: string, fields: array<int, array{label: string, key: string}>}>}
 */
return [
    'title' => 'Site Name',
    'intro' => 'Краткое описание сайта для AI-краулеров.',
    'collections' => [
        // Пример коллекции — раскомментировать и адаптировать:
        // [
        //     'list_path'   => '{lang}/pages/products.json',
        //     'list_key'    => 'items',
        //     'item_dir'    => '{lang}/products',
        //     'name_key'    => 'item.name',
        //     'desc_key'    => 'desc.short',
        //     'visible_key' => 'visible',
        //     'fields'      => [
        //         ['label' => 'Категория', 'key' => 'item.category'],
        //     ],
        // ],
    ],
];
