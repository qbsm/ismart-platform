# Naming Conventions — соглашения для масштабируемого нейминга

При росте платформы важно, чтобы имена классов читались однозначно и группировались. Текущий ядро невелико (35 классов), но через 1-2 итерации их будет 70+ — без явных правил быстро накопится хаос.

## Структура `src/` по семантике (что где живёт)

| Папка | Семантика | Конвенция имени | Пример |
|---|---|---|---|
| `Action/` | Slim-handler, отвечает за HTTP-вход | `*Action` | `PageAction`, `SitemapAction` |
| `Middleware/` | PSR-15 middleware | `*Middleware` | `SecurityHeadersMiddleware` |
| `Handler/` | Обработчик ошибок (Slim-стиль) | `*Handler` / `*ErrorHandler` | `HttpErrorHandler` |
| `Service/` | Бизнес-логика с DI-зависимостями | `*Service` или функциональное имя с GoF-pattern'ом | `MailService`, `TemplateDataBuilder` |
| `Event/` | PSR-14 domain event (past participle, без суффикса) | `*` (глагол в past) | `EntityResolved`, `PageLoaded`, `SeoBuilt` |
| `Twig/` | Twig extensions | `*Extension` | `AssetExtension` |
| `Support/` | Утилиты, статические хелперы, traits, константы | см. подсхему ниже | `Arr`, `Json`, `RespondsToContent` |

## Внутри `Support/` — четыре под-конвенции (по типу класса)

| Под-категория | Конвенция имени | Признаки | Примеры |
|---|---|---|---|
| **Static utility** | Короткое тематическое слово (имя = namespace-функции) | `final class` + `private function __construct()`, только статические методы | `Arr`, `Json` |
| **Pattern-based** | Тема + суффикс GoF-pattern'а (Resolver/Processor/Builder/Slugger/Factory) | Может быть `final class` со state'ом или статика | `BaseUrlResolver`, `JsonProcessor`, `CitySlugger` |
| **Constants/Attributes** | Тема + множественное число (`*Attributes`/`*Settings`) | `final class` с `public const` + private constructor | `RequestAttributes`, `PlatformSettings` |
| **Trait** | Verb-phrase, без суффикса `Trait` | Глагольная фраза описывает добавляемое поведение | `RespondsToContent`, потенциально `HasRequestId`, `IsRateLimited` |

## Правила выбора имени

1. **Если класс имеет один глагол** — поставь его в имя как pattern: `JsonLoader` > `Json` ↘ выбираешь `Json` если методов будет много (`load`, `loadKey`, `validate`, `merge`), `JsonLoader` если один (`load`).
2. **Если класс — namespace для констант** — имя в множественном числе (`*Attributes`, `*Codes`). Иначе путается с DTO.
3. **Если класс — DTO/value object** (immutable носитель данных) — имя в единственном числе (`PageContext`, `EntityRef`). Сейчас в ядре нет VO — все данные ходят как `array<string,mixed>` (это долг).
4. **Если класс — Service** — суффикс `Service` ставится **тогда и только тогда**, когда GoF-имени pattern'а нет. `TemplateDataBuilder` — Builder pattern, поэтому без `Service`. `MailService` — нет специального pattern'а, поэтому с `Service`.
5. **Trait** — `Has*` / `*able` / verb-phrase. Не использовать суффикс `Trait` в имени.

## Запрещённое

- Имена в духе `Manager`, `Helper`, `Utils`, `Common` — слишком абстрактно, говорит «я не знал, как назвать». Лучше специфический pattern.
- Постфикс `Interface` на имени интерфейса — namespace `App\Service\Seo\BuilderInterface` нормально, но `BuilderInterface` без контекста плох. Если в одной папке Interface + Impl — то `BuilderInterface` + `DefaultBuilder` / `GenericBuilder` приемлемо.
- Хардкод бренда/deployment в имени (`KumhoSomething`, `RestaurantThing`). Это автоматически выкидывает класс из baseline.

## Под-namespace'ы — когда выделять

Пока `Support/` плоский (8 файлов) — это нормально. После 15+ файлов имеет смысл подгруппировать:

```
src/Support/
  Http/             # RespondsToContent.php, RequestAttributes.php, BaseUrlResolver.php
  Json/             # Json.php, JsonProcessor.php
  Settings.php      # переименован из PlatformSettings
  Str/              # Slugger, Translit, и т.п.
  Arr.php
```

**Триггер для выделения подпапки**: 3+ файла одной темы. Меньше — не дробим (нагромождение пустых директорий хуже плоской структуры).

## Косметические правки на будущее

Сейчас переименовывать ничего критичного не нужно — текущие 8 файлов в `Support/` следуют какой-то из четырёх под-конвенций. Будущие движения:

- `PlatformSettings` — норм как Constants/Attributes имя. Если появятся другие settings-aspects — переименуем в `Settings` и разнесём по подпапке.
- `JsonProcessor` — пока статика без состояния. Когда добавим `Json::process()` — JsonProcessor может слиться в `Json::processPaths()`.
- `CitySlugger` — норм, GoF-pattern (Slugger). Не трогать.
