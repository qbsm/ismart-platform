## Метрики производительности приложения

Логируются в файл `logs/app.log` в формате JSON Lines (одна запись на строку).

### Поля записи

- `time`: ISO 8601
- `url`: полный request URI
- `method`: HTTP-метод
- `status`: HTTP-статус ответа
- `lang`: язык страницы
- `page_id`: идентификатор страницы
- `template`: путь к Twig-шаблону
- `perf.total_ms`: суммарное время обработки запроса (мс)
- `perf.render_ms`: время рендера Twig (мс)
- `ip`: IP клиента
- `ua`: user-agent

### Пример

```json
{"time":"2025-08-08T10:00:00+03:00","url":"/","method":"GET","status":200,"lang":"ru","page_id":"index","template":"pages/index.twig","perf":{"total_ms":42,"render_ms":18},"ip":"127.0.0.1","ua":"Mozilla/5.0"}
```

### Анализ

- Для анализа используйте `jq`, `awk` или загрузку в систему логирования.
- Сравнивайте `total_ms` и `render_ms` для выявления узких мест вне Twig.

