<?php

namespace App\Service;

final class TemplateDataBuilder
{
    /**
     * Собирает финальный массив данных для Twig-шаблона.
     *
     * Объединяет настройки, глобальные данные, данные страницы, SEO,
     * контекст запроса (язык, base_url, csrf) и дополнительные данные (entity, breadcrumb).
     * Извлекает hero-изображение для preload и пути шрифтов из fonts.css.
     *
     * @param array<string,mixed>      $settings Конфигурация приложения
     * @param array<string,mixed>      $global   Глобальные данные (навигация, контакты)
     * @param array<string,mixed>|null $pageData Данные страницы (sections, items)
     * @param array<string,mixed>|null $seo      SEO-данные (title, meta, json_ld)
     * @param array<string,mixed>      $ctx      Контекст запроса (lang_code, page_id, base_url, csrf_token)
     * @param array<string,mixed>      $extras   Дополнительные данные (entity, breadcrumb, tire, news и т.д.)
     * @return array<string,mixed> Готовые данные для передачи в Twig
     */
    public function build(
        array $settings,
        array $global,
        ?array $pageData,
        ?array $seo,
        array $ctx,
        array $extras = []
    ): array {
        $sections = (isset($pageData['sections']) && is_array($pageData['sections'])) ? $pageData['sections'] : [];
        $heroPreloadImage = $this->extractHeroPreloadImage($sections);
        $preloadFonts = $this->extractFontPathsFromCss((string) ($settings['project_root'] ?? ''));

        $pageId = $ctx['page_id'] ?? null;
        $pageTitle = $seo['title'] ?? ($pageData['title'] ?? '');
        $templateData = [
            'settings' => $settings,
            'config' => ['settings' => $settings],
            'global' => $global,
            'currentLang' => $ctx['current_lang'] ?? null,
            'lang_code' => $ctx['lang_code'] ?? null,
            'page_id' => $pageId,
            'route_params' => $ctx['route_params'] ?? [],
            'base_url' => $ctx['base_url'] ?? '/',
            'is_lang_in_url' => $ctx['is_lang_in_url'] ?? false,
            'csrf_token' => $ctx['csrf_token'] ?? '',
            'pageData' => $pageData,
            'pageSeoData' => $seo,
            'pageTitle' => $pageTitle,
            'sections' => $sections,
            'hero_preload_image' => $heroPreloadImage,
            'preload_fonts' => $preloadFonts,
            'breadcrumb' => $this->buildBreadcrumb(
                $global,
                (string) $pageId,
                (string) ($ctx['lang_code'] ?? ''),
                $pageTitle,
                (array) ($ctx['route_params'] ?? []),
                (array) ($settings['route_map'] ?? [])
            ),
        ];

        foreach ($extras as $key => $value) {
            $templateData[$key] = $value;
        }

        return $templateData;
    }

    /**
     * Извлекает hero-изображение для responsive preload (imagesrcset + type).
     *
     * Возвращает объект с ключами размеров (400, 800, ...) и src для fallback,
     * либо строку (обратная совместимость), либо null.
     *
     * @param array<int,array<string,mixed>> $sections
     * @return array<string,string>|string|null
     */
    private function extractHeroPreloadImage(array $sections): array|string|null
    {
        foreach ($sections as $section) {
            if (isset($section['name']) && $section['name'] !== 'intro') {
                continue;
            }
            $items = $section['data']['slider']['items'] ?? null;
            if (!is_array($items) || $items === []) {
                return null;
            }
            $first = $items[0];

            // cover — одиночный URL
            if (isset($first['cover']) && is_string($first['cover'])) {
                return $first['cover'];
            }

            // image с числовыми ключами (адаптивные размеры)
            if (isset($first['image']) && is_array($first['image'])) {
                $image = $first['image'];
                $sizeKeys = ['400', '800', '1280', '1600', '1920', '2560'];
                $hasAdaptive = false;
                foreach ($sizeKeys as $key) {
                    if (isset($image[$key]) && is_string($image[$key]) && $image[$key] !== '#') {
                        $hasAdaptive = true;
                        break;
                    }
                }
                if ($hasAdaptive) {
                    /** @var array<string,string> $result */
                    $result = [];
                    foreach ($sizeKeys as $key) {
                        if (isset($image[$key]) && is_string($image[$key]) && $image[$key] !== '#') {
                            $result[$key] = $image[$key];
                        }
                    }
                    // horizontal для art-direction
                    if (isset($image['horizontal']) && is_array($image['horizontal'])) {
                        foreach ($sizeKeys as $key) {
                            if (isset($image['horizontal'][$key]) && is_string($image['horizontal'][$key]) && $image['horizontal'][$key] !== '#') {
                                $result[$key] = $image['horizontal'][$key];
                            }
                        }
                    }
                    if ($result !== []) {
                        return $result;
                    }
                }

                // Fallback: raw/src
                if (isset($image['raw']) && is_string($image['raw'])) {
                    return $image['raw'];
                }
                if (isset($image['src']) && is_string($image['src'])) {
                    return $image['src'];
                }
            }

            return null;
        }
        return null;
    }

    /**
     * Извлекает пути основных шрифтов из fonts.css для preload.
     *
     * Preload ограничен 3 шрифтами — только те, что нужны для первого экрана:
     * Source Sans 3 (основной текст), TT Norms Pro Expanded Regular и Bold (заголовки).
     * Остальные шрифты загружаются через font-display: swap без preload.
     *
     * @return array<int,string>
     */
    private function extractFontPathsFromCss(string $projectRoot): array
    {
        // Только критические шрифты для первого экрана (above-the-fold)
        $criticalFonts = [
            'assets/fonts/source-sans-3/SourceSans3VF-Upright.ttf.woff2',
            'assets/fonts/manrope/ManropeVariable.woff2',
            'assets/fonts/tt-norms-pro-variable/TTNormsProVariable.woff2',
        ];

        $paths = [];
        foreach ($criticalFonts as $font) {
            $fullPath = $projectRoot . '/' . $font;
            if (is_readable($fullPath)) {
                $paths[] = $font;
            }
        }

        return $paths;
    }

    /**
     * Строит цепочку хлебных крошек для JSON-LD BreadcrumbList.
     *
     * @param array<string,mixed> $global
     * @param array<string,string> $routeMap slug => page_id
     * @return array<int, array{name: string, url: string}>
     */
    private function buildBreadcrumb(
        array $global,
        string $pageId,
        string $langCode,
        string $pageTitle,
        array $routeParams,
        array $routeMap
    ): array {
        $reverseMap = array_flip($routeMap);
        $homeName = 'Главная';
        $homeUrl = '/';

        if (isset($global['nav'][$langCode]['items']) && is_array($global['nav'][$langCode]['items'])) {
            foreach ($global['nav'][$langCode]['items'] as $item) {
                if (!is_array($item) || !isset($item['href'])) {
                    continue;
                }
                $href = trim((string) $item['href'], '/');
                if ($href === '' || $href === '/') {
                    $homeName = isset($item['title']) ? (string) $item['title'] : $homeName;
                    $homeUrl = '/';
                    break;
                }
            }
        }

        $items = [['name' => $homeName, 'url' => $homeUrl]];

        if ($pageId !== 'index' && $pageId !== '404') {
            $pathSegment = (string) ($reverseMap[$pageId] ?? $pageId);
            $path = $pathSegment;
            if ($routeParams !== []) {
                $path .= '/' . implode('/', $routeParams);
            }
            $items[] = [
                'name' => $pageTitle !== '' ? $pageTitle : $pathSegment,
                'url' => '/' . $path . '/',
            ];
        }

        return $items;
    }
}
