# Аудит шрифтов и variable fonts

## Текущее состояние

- **TT Norms Pro** (Basic): загружаются начертания 100–900 (9 файлов .ttf).
- **TT Norms Pro Expanded**: загружаются 300, 400, 500, 600, 700 (5 файлов .ttf).

Шрифты подключаются в `assets/css/base/fonts.css`, переменные и классы — в `assets/css/base/variables.css` и `assets/css/base/typography.css`.

## Аудит использования начертаний

По коду (шаблоны, JSON, CSS) реально используются:

| Начертание | Где используется |
|------------|------------------|
| 200 (ExtraLight) | `card-number.css` (визуал счётчика) |
| 300 (Light) | JSON: `weight-300`, `font-1 weight-300` (index, owners) |
| 400 (Regular/Normal) | Формы, mini-table, cookie, кнопки, глобал |
| 500 (Medium) | Accordion, card-number (--font-1-extended), card-restaurant |
| 600 (DemiBold) | Spoiler, accordion, footer, form-callback |
| 700 (Bold) | Slider (общий bold), типографика |

**Не используются в интерфейсе:** 100 (Thin), 800 (ExtraBold), 900 (Black).

Рекомендация: можно не подключать в критичный путь начертания 100, 800, 900 (удалить из `fonts.css` или подгружать по мере надобности), если они не планируются в контенте.

## Variable fonts

Сейчас каждое начертание — отдельный файл, что даёт много запросов и дублирование данных.

**Варианты:**

1. **Проверить наличие variable font у TypeType (TT Norms Pro)**  
   На сайте шрифта или в лицензии может быть версия с осью `wght` (weight). Один файл variable font заменяет несколько статических.

2. **Если variable font доступен**  
   - Добавить один `@font-face` с `font-weight: 100 900` и `src` на variable font.  
   - Удалить или закомментировать отдельные `@font-face` для статических файлов.  
   - Проверить отображение в основных браузерах.

3. **Если variable font нет**  
   Оставить текущую схему; для сокращения числа запросов — оставить только используемые начертания (см. аудит выше).

Проверка поддержки: [caniuse.com/font-variations](https://caniuse.com/font-variations).
