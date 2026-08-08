# Proposal 0017: Retina для cover-фонов через `image_set()` (DPR-свитчинг для `background-image`)

**Status:** Proposed
**Дата:** 2026-06-04
**Reference implementation:** `tank-avilon` (эта сессия) — `src/Twig/DataExtension.php`, `templates/components/card-*.twig`
**Scope:** core — `src/Twig/DataExtension.php`, шаблоны карточек с cover-фоном (`card-tire`, `card-news`, `card-nav`, `card-gradient`, секции `intro`, `frame`)
**Related:** proposal 0003 / ADR-0007 (raw-source picture), proposal 0006 / ADR-0006 (manifest-driven images), `templates/components/picture.twig`

---

## Контекст

`picture.twig` ретину **поддерживает корректно** — он эмитит `srcset` с `w`-дескрипторами (`400w … 2560w`) + `sizes`. Браузер сам берёт ширину слота из `sizes`, умножает на `devicePixelRatio` и выбирает нужного кандидата. Отдельные `2x`/`1x` тут не нужны.

Боль — **не в `<picture>`, а в cover-фонах на CSS**. Карточки выводят обложку как `background-image: url(...)`, у которого **нет ни `srcset`, ни `sizes`** — DPR никак не учитывается. Хуже того, путь берётся через `image_fallback()`, который по контракту возвращает **самый маленький** ключ (`400w`, экономия трафика в грид-листах). Итог: в контейнер, который физически шире 400px, грузится 400px-картинка — мыло и на retina, и даже на 1x при широкой карточке.

Затронутые места (`background-image` + `image_fallback`/мелкий ключ):

| Файл | Узел |
| --- | --- |
| `templates/components/card-tire.twig:19` | `card-tire__cover` |
| `templates/components/card-news.twig:7,13` | `card-news__cover` |
| `templates/components/card-nav.twig:8` | `card__cover` |
| `templates/components/card-gradient.twig:8` | cover-div |
| `templates/sections/intro.twig:23` | `cover` |
| `templates/sections/frame.twig:13` | cover-фон |

## Решение

Нативный DPR-свитчинг для фонов — CSS `image-set()`. Новый Twig-хелпер `image_set(rawPath, baseKey='400', maxDpr=2)` собирает из manifest'а значение вида:

```css
image-set(url('…/400/cover.webp') 1x, url('…/800/cover.webp') 2x)
```

Лесенка размеров (`400/800/1280/1600/1920/2560`) даёт чистые целочисленные пары: `400→800` (1x/2x), `800→1600`, `1280→2560`. Хелпер берёт `base*1` и `base*2` из реально сгенерированных вариантов (downscale-only, ADR-0006 гейтинг сохраняется): нет файла — плотность не эмитится; нет `1x` — возвращается `''` (невалидный `image-set`).

`image-set()` решает заодно и трафик: 1x-экраны получают `400w`, а не вынужденно крупный ключ.

### Хелпер (`src/Twig/DataExtension.php`)

Регистрация в `getFunctions()`:

```php
new TwigFunction('image_set', [$this, 'imageSet']),
```

Реализация (опирается на существующий `imageVariants()` и `$this->baseUrl`):

```php
/**
 * Собирает CSS-значение image-set() для retina-фонов (background-image).
 *
 * Лесенка ключей == ширины (400/800/…); плотность 1x = baseKey,
 * 2x = baseKey*2 и т.д. Эмитятся только реально сгенерированные варианты
 * (downscale-only, ADR-0006). Если baseKey (1x) отсутствует — image-set
 * невалиден, возвращаем '' (шаблон откатывается на plain url()).
 *
 * @param string $rawPath raw-path обложки ("data/img/news/raw/x.webp")
 * @param string $baseKey ключ для плотности 1x (по умолчанию '400')
 * @param int    $maxDpr  максимальная плотность кандидата (по умолчанию 2)
 */
public function imageSet(string $rawPath, string $baseKey = '400', int $maxDpr = 2): string
{
    $base = (int) $baseKey;
    if ($base <= 0 || $maxDpr < 1) {
        return '';
    }
    $variants = $this->imageVariants($rawPath);
    $items = [];
    for ($dpr = 1; $dpr <= $maxDpr; $dpr++) {
        $key = (string) ($base * $dpr);
        $variant = $variants[$key] ?? null;
        if (is_array($variant) && !empty($variant['webp'])) {
            $url = $this->baseUrl . ltrim($variant['webp'], '/');
            $items[] = sprintf("url('%s') %dx", $url, $dpr);
        }
    }
    // 1x обязателен: без базовой плотности image-set невалиден.
    if ($items === [] || !str_contains($items[0], ' 1x')) {
        return '';
    }
    return 'image-set(' . implode(', ', $items) . ')';
}
```

Примечания:
- URL префиксуется `$this->baseUrl` напрямую (тот же приём, что в `imageVariants()` для путей `data/img/`). Это сознательно дублирует `url()` из `UrlExtension`, чтобы не тащить межрасширенческую зависимость; Windows-нормализация фону не нужна (пути уже `/`-нормализованы в `normalizeManifestKey`).
- Внутри `url('…')` — **одинарные** кавычки: при выводе в `style="…"` Twig html-эскейпит `'` в `&#039;`, который браузер декодирует обратно в атрибуте. Двойные кавычки сломали бы атрибут. `is_safe` не требуется.

### Разметка (паттерн миграции)

`background-image` остаётся inline (cover динамичен per-item, в CSS-класс не вынести). Две декларации — универсальный `url()`-фолбэк + `image-set`-оверрайд:

```twig
{# было #}
<div class="card-news__cover" style="background-image: url('{{ url(_coverFallback) }}');"></div>

{# стало #}
{% set _set = image_set(item.cover) %}
<div class="card-news__cover"
     style="background-image: url('{{ url(_coverFallback) }}'){% if _set %}; background-image: {{ _set }}{% endif %};"></div>
```

Каскад: браузер без `image-set` (Safari ≤16, старый Chrome) игнорирует вторую декларацию и оставляет `url()` — **ровно текущее поведение, регрессии нет**. Современные (Chrome 113+, Safari 17+, Firefox 89+) применяют `image-set` и получают 2x. `-webkit-image-set` сознательно не эмитим: inline-стили автопрефиксер не обрабатывает, а деградация на старом Safari = текущий 1x.

## Миграция

1. `image_set()` в `DataExtension` + регистрация.
2. Шаблоны из таблицы выше — на двухдекларационный паттерн. `image_fallback()`/мелкий ключ остаётся как `url()`-фолбэк (не удаляем).
3. `card-nav`/`card-gradient`/`intro`/`frame` берут `cover.src` напрямую — там `image_set(cover.src)` (raw-path). Если cover не raw (legacy-объект) — `image_set()` вернёт `''`, фолбэк отработает.

## Альтернатива (рассмотрена, отклонена для этого раунда)

Перевести cover-div'ы на `<picture>` + `object-fit: cover` — полностью переиспользует retina-корректный `picture.twig`, без нового хелпера и без забот о префиксах. Но это бо́льшая правка разметки/CSS каждой карточки (контейнер, позиционирование оверлеев поверх `<img>` вместо фона). Оставлено как возможный следующий шаг; `image_set()` — минимально инвазивный фикс, закрывающий боль сейчас.

## Acceptance

- `image_set()` покрыт unit-тестом (PHPUnit): raw-path → корректный `image-set(url('…/400/…') 1x, url('…/800/…') 2x)`; отсутствие 2x-варианта → только `1x`; отсутствие манифеста/не-raw → `''`.
- Карточки из таблицы рендерят две декларации; DevTools на 2x-эмуляции грузит `800/`-вариант.
- `npm run verify` (build:js + build:css зелёные) — обязательно перед distill sync.
