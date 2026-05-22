# Сессия 2026-05-22 — Review proposal 0001 (Notification Channels)

Review proposal `docs/proposals/0001-notification-channel-dispatcher.md` под расширенный набор базовых каналов. Кода ядра не трогали — только сам proposal и memory.

## Главное

**Набор baseline-каналов расширен с 1 до 4.** В первой версии proposal CallTouch был помечен как kumho-specific интеграция, остальные каналы (Telegram, Sheets, Webhook) шли в «решения на потом» / «пример расширения». Пользователь зафиксировал три уточнения подряд: «calltouch это база», «телеграм бот тоже база», «и гугл таблицу». Итог — Mail + CallTouch + Telegram + Google Sheets все четыре едут в baseline, точка расширения `project.php::notification_channels` остаётся только для будущих deployment-specific каналов (например, клиентский webhook).

**Per-deployment selection снят с критического пути.** В v1 proposal я считал его блокером для merge (kumho был бы обязан держать `container.php` в overrides). После уточнения базового набора — все 4 канала перечисляются в фабрике Dispatcher'а baseline, deployment рулит только env'ом (`*_ENABLE`, credentials). `isEnabled()` каждого канала возвращает `disabled` при пустых credentials — это нормальное состояние, не drift для divergence-audit.

**Google Sheets — единственный канал без working reference.** Mail + CallTouch уже работают в kumho (коммит `810b6a2`, +376 строк). Telegram + Sheets реализуются непосредственно в рамках baseline-merge. Решено: 15-колоночная фиксированная схема таблицы (`timestamp | request_id | name | phone | email | message | form_id | page_url | utm_* | user_agent | ip`), credentials в `config/secrets/google-service-account.json` (gitignored, с `.htaccess` страховкой), кэш access_token в `cache/google-sheets/token.json` (TTL 50 мин). Зависимость — только `firebase/php-jwt` (~70KB), без полного `google/apiclient` (~30MB transitive deps).

## Решения по каналам

- **MailChannel** — `isEnabled()` зависит от `MAIL_TO !== ''`, не хардкод `true` (иначе CI без SMTP падает).
- **CallTouchChannel** — переносится из kumho 1:1, split CURL timeouts `CONNECTTIMEOUT=3`, `TIMEOUT=10`.
- **TelegramChannel** — `sendMessage` + `sendDocument` per file. Один `TG_CHAT_ID` на deployment. Per-form routing — на потом через `project.php::telegram_routes`.
- **GoogleSheetsChannel** — JWT service account, фиксированная 15-колоночная схема в исходнике (не в `project.php`), header пишется при первой записи в пустой sheet. Новое поле формы → правка baseline для всех deployments — согласуется с content-agnostic принципом ядра.

## Что обновлено

- `docs/proposals/0001-notification-channel-dispatcher.md` — переписан v2 (1 канал → 4 базовых, расширены Acceptance / Структура файлов / Регистрация / Зависимости).
- `~/.claude/projects/-Users-danich-Sites-ismart-platform/memory/project_notification_channels.md` — зафиксирован базовый набор, решения по каждому каналу.
- `MEMORY.md` — добавлен указатель на новую project-memory.

## Не сделано в этой сессии

- Реальная реализация TelegramChannel, GoogleSheetsChannel в коде baseline'а — отдельный шаг (по сути полноценный feat-PR на ~400-600 строк).
- Миграция proposal → `decisions/0005-notification-channel-dispatcher.md` после merge.
- Прогон commit-miner для самопроверки (должен был поймать reference-коммит `810b6a2` в kumho как «Reusable feature» candidate). Запланировано на следующую сессию.
- Обновление `config/secrets/README.md` с инструкцией «как получить google-service-account.json».
