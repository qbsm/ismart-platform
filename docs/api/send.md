# API Contract: `POST /api/send`

Контракт для отправки формы обратной связи (`form-callback`).

## Request

- **Method:** `POST`
- **Content-Type:** `multipart/form-data` (через `FormData`)
- **Headers:**
  - `X-Requested-With: XMLHttpRequest`
  - `X-Request-Id: <uuid>` (рекомендуется, если будет внедрён на фронте)

### Body fields

- `phone` (required, string) — телефон в нормализованном виде, только цифры, например `79991234567`
- `name` (optional, string)
- `square` (optional, string)
- `email` (optional, string)
- `policy` (optional, `on|off`)
- `lang` (required, string) — код языка, например `ru`, `en`, `de`
- `current_url` (optional, string) — очищенный URL страницы без чувствительных query-параметров
- `csrf_token` (required, string)
- UTM-поля (optional):
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
  - `utm_term`
  - `utm_content`
  - `utm_session`
- `idempotency_key` (optional, string) — для дедупликации повторных отправок
- `captcha_token` (optional, string) — для Turnstile/Recaptcha (если включено)

## Response format

Все ответы возвращаются в JSON.

### Success

HTTP `200`

```json
{
  "success": true,
  "message": "Заявка успешно отправлена",
  "request_id": "d6b2b32a-1db1-4f05-9f94-37c91372f91b"
}
```

### Validation error

Рекомендуемый вариант: HTTP `422`  
Допустимый legacy-вариант: HTTP `200` + `success: false`

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Проверьте поля формы",
  "errors": {
    "phone": "Неверный телефон",
    "policy": "Согласитесь с политикой"
  },
  "request_id": "d6b2b32a-1db1-4f05-9f94-37c91372f91b"
}
```

### CSRF error

HTTP `419` (или `403`, если в проекте так принято)

```json
{
  "success": false,
  "code": "CSRF_INVALID",
  "message": "Сессия истекла. Обновите страницу и попробуйте снова.",
  "request_id": "d6b2b32a-1db1-4f05-9f94-37c91372f91b"
}
```

### Rate limit error

HTTP `429`

```json
{
  "success": false,
  "code": "RATE_LIMITED",
  "message": "Слишком много запросов. Повторите позже.",
  "retry_after": 60,
  "request_id": "d6b2b32a-1db1-4f05-9f94-37c91372f91b"
}
```

### Async processing (optional)

HTTP `200`

```json
{
  "success": true,
  "processing": true,
  "request_id": "d6b2b32a-1db1-4f05-9f94-37c91372f91b",
  "message": "Заявка принята в обработку"
}
```

## Notes

- Фронт должен опираться на `success` и `code`, а `message` использовать как пользовательский текст.
- Если выбран режим `422` для валидации, применять его единообразно во всех form-endpoints проекта.
