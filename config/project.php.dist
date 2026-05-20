<?php

// Проектная конфигурация — специфичная для текущего заказчика / deployment'а.
// Для нового заказчика: скопировать project.php.dist -> project.php и адаптировать.

return [
    // slug в URL => page_id (файл data/json/{lang}/pages/{page_id}.json)
    'route_map' => [
        // 'catalog' => 'catalog-list',
    ],

    // Параметризация коллекций: каждая коллекция описывается полностью через конфиг.
    // Добавление/удаление коллекции — только здесь, 0 правок PHP.
    'collections' => [
        // 'products' => [
        //     'nav_slug'     => 'products',
        //     'list_page_id' => 'products-list',
        //     'template'     => 'pages/product.twig',
        //     'item_key'     => 'item',
        //     'data_dir'     => 'products',
        //     'slugs_source' => 'items',
        //     'og_type'      => 'website',
        //     'extras_key'   => 'product',
        // ],
    ],

    // page_id страниц для sitemap.xml (без 404)
    'sitemap_pages' => [
        'index',
    ],

    // Внешние интеграции (флаги включения)
    'integrations' => [
        // 'photoroom' => ['enabled' => true],
    ],
];
