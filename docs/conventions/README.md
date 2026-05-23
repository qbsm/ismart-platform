# conventions

Как пишем код в платформе — нейминг, стиль, git, env. Обязательно к прочтению перед PR.

## Файлы

| Файл | Описание |
|---|---|
| [`best-practices.md`](best-practices.md) | Принципы (минимализм, type-safety, immutability) |
| [`naming.md`](naming.md) | PHP: имена классов/папок (Action/Service/Middleware/Support) |
| [`html-naming.md`](html-naming.md) | HTML: классы, идентификаторы, атрибуты |
| [`css-naming.md`](css-naming.md) | CSS: структура файлов, BEM-подобная схема |
| [`js-naming.md`](js-naming.md) | JS: селекторы, модули, глобальные объекты |
| [`twig-naming.md`](twig-naming.md) | Twig: секции, переменные, подключения |
| [`json-naming.md`](json-naming.md) | JSON: структура страниц и data-файлов |
| [`git.md`](git.md) | Git: ветки, Conventional Commits, PR, tags |
| [`env-vars.md`](env-vars.md) | ENV: `SCREAMING_SNAKE_CASE`, префиксы, `.env.example` |
| [`routes-and-urls.md`](routes-and-urls.md) | URLs: kebab-case slug, trailing slash, `/api/*` vs `/{page}/` |

## Когда писать сюда

Договорённость по стилю / нейму / тестам — добавлять как новый `.md` в этой папке. Если это how-to, а не правило — `../guides/`.
