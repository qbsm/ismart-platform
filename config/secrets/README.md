# config/secrets

Папка для **service-account credentials** и других секретных JSON-файлов, которые нельзя коммитить в репозиторий.

## Что лежит здесь

- `google-service-account.json` — credentials Google service account для `GoogleSheetsChannel` (см. `src/Notification/Channel/GoogleSheetsChannel.php`).

## Защита от утечки

- Все `*.json` в этой папке **gitignored** (см. `.gitignore` корня репозитория). Исключения — только `.gitkeep`, `.htaccess`, `README.md`.
- `.htaccess` в этой папке — `Require all denied`. Страховка от случайного symlink в `public/` — Apache не выдаст содержимое по HTTP.
- Папка **не** должна попадать в `public/`. Никогда не делайте `ln -s config/secrets public/secrets`.

## Как получить `google-service-account.json`

1. Открыть [Google Cloud Console](https://console.cloud.google.com/).
2. Создать проект или выбрать существующий.
3. APIs & Services → Library → найти "Google Sheets API" → Enable.
4. APIs & Services → Credentials → Create Credentials → Service Account.
5. Дать имя (например `ismart-sheets-bot`), Continue, пропустить опциональные шаги, Done.
6. Открыть созданный service account → вкладка Keys → Add Key → Create new key → JSON → Create.
7. Скачанный JSON положить сюда как `google-service-account.json`.
8. Скопировать из JSON значение поля `client_email` (`xxx@yyy.iam.gserviceaccount.com`).
9. Открыть нужную Google Sheets-таблицу, кнопка Share → вставить этот email → дать роль **Editor**.

## Конфигурация в `.env`

```
GS_ENABLE=true
GS_SPREADSHEET_ID=<id из URL таблицы: docs.google.com/spreadsheets/d/{ID}/edit>
GS_SHEET_NAME=Заявки
GS_CREDENTIALS_PATH=config/secrets/google-service-account.json
GS_TIMEOUT=10
```

## Структура таблицы

`GoogleSheetsChannel` пишет в `{sheet_name}!A:O` (15 фиксированных колонок). При первой записи в пустую вкладку — пишет строку заголовков. Список колонок и заголовков — в исходнике канала (`COLUMNS` / `HEADER_RU`).

Не редактируйте заголовки/порядок колонок руками — следующая запись добавит данные не в те ячейки.
