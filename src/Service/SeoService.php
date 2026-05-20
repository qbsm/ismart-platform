<?php

namespace App\Service;

use Twig\Environment;
use Twig\Error\Error;

final class SeoService
{
    /**
     * Рекурсивно рендерит Twig-шаблоны внутри SEO-данных.
     *
     * Строковые значения обрабатываются как Twig-шаблоны с переданным контекстом.
     * При ошибке рендеринга возвращает исходные данные без изменений.
     *
     * @param array<string,mixed>|null $seoData SEO-данные (title, meta, json_ld)
     * @param array<string,mixed>      $context Контекст для Twig (pageData, global, settings и др.)
     * @param Environment              $twig    Twig-окружение для createTemplate
     * @return array<string,mixed>|null Обработанные SEO-данные или null
     */
    public function processTemplates(?array $seoData, array $context, Environment $twig): ?array
    {
        if ($seoData === null) {
            return null;
        }

        try {
            $render = function ($value) use (&$render, $context, $twig) {
                if (is_array($value)) {
                    $result = [];
                    foreach ($value as $key => $item) {
                        $result[$key] = $render($item);
                    }
                    return $result;
                }

                if (is_string($value)) {
                    return $twig->createTemplate($value)->render($context);
                }

                return $value;
            };

            return $render($seoData);
        } catch (Error $e) {
            error_log('SEO Twig error: ' . $e->getMessage());
            return $seoData;
        }
    }
}
