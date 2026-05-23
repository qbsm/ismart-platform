# Proposal 0007: Data-driven form validation в ApiSendAction

**Status:** Proposed
**Date:** 2026-05-24
**Scope:** core — `src/Action/ApiSendAction.php`, `config/project.php`

---

## Контекст

Baseline `ApiSendAction::validate()` (после ADR-0005) hardcoded требует поля **phone** и **policy**:

```php
$phoneRaw = Arr::str($data, 'phone');
$phone = preg_replace('/\D+/', '', $phoneRaw) ?? '';
if ($phone === '' || strlen($phone) < 7 || strlen($phone) > 15) {
    $errors['phone'] = 'Неверный телефон';
}
$policy = Arr::str($data, 'policy');
if ($policy !== 'on') {
    $errors['policy'] = 'Согласитесь с политикой';
}
$email = Arr::str($data, 'email');
if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    $errors['email'] = 'Неверный E-mail';
}
```

**Проблема:** не все deployment'ы имеют форму с phone:
- **kumho**: phone, name, square, policy — нужен phone ✓
- **italy** (подписка): email, name, city, policy — phone отсутствует ✗
- **beepitron** (потенциально): другой набор

При синхронизации baseline ApiSendAction → italy форма не работает (422 на любой submit без phone).

Сейчас в italy `src/Action/ApiSendAction.php` — **deployment-override**, валидирует email/name/policy (свой код). Это означает что **исправления и улучшения** baseline ApiSendAction (CSRF, idempotency, channels-integration) не доходят до italy без ручного merge.

## Решение

Validation rules **data-driven** через `config/project.php::form_validation` (или `data/json/global.json::form-callback.rules` если уже есть структура):

```php
// config/project.php
'form_validation' => [
    'fields' => [
        'phone' => ['required' => true, 'type' => 'phone', 'min' => 7, 'max' => 15],
        'email' => ['required' => false, 'type' => 'email'],
        'name'  => ['required' => true, 'min_length' => 2],
        'city'  => ['required' => false],
        'policy' => ['required' => true, 'rule' => 'must_be_on'],
    ],
],
```

`ApiSendAction::validate()` читает settings и применяет rules dynamically. Backend и фронт-валидация (validation.js через `aria-required`) согласованы.

**kumho `project.php`:**
```php
'form_validation' => [
    'fields' => [
        'phone'  => ['required' => true, 'type' => 'phone'],
        'name'   => ['required' => true, 'min_length' => 2],
        'square' => ['required' => false],
        'policy' => ['required' => true],
    ],
],
```

**italy `project.php`:**
```php
'form_validation' => [
    'fields' => [
        'email'  => ['required' => true, 'type' => 'email'],
        'name'   => ['required' => true, 'min_length' => 2],
        'city'   => ['required' => true],
        'policy' => ['required' => true],
    ],
],
```

### Implementation

`src/Action/ApiSendAction.php` — universal validator:

```php
private function validate(array $data): array
{
    $errors = [];
    $fields = $this->settings['form_validation']['fields'] ?? [];

    foreach ($fields as $name => $rules) {
        $value = Arr::str($data, $name);
        if (($rules['required'] ?? false) && $value === '') {
            $errors[$name] = 'Поле обязательно';
            continue;
        }
        // type checks: phone, email, custom
        if ($value !== '' && isset($rules['type'])) {
            if (!$this->validateType($value, $rules['type'], $rules)) {
                $errors[$name] = $this->errorMessage($name, $rules);
            }
        }
        if (isset($rules['min_length']) && mb_strlen($value) < $rules['min_length']) {
            $errors[$name] = 'Минимум ' . $rules['min_length'] . ' символов';
        }
        // ... rule: 'must_be_on' для checkbox policy
    }

    return $errors;
}
```

## Миграция

1. Baseline: реализация data-driven validate + дефолтная config для phone+policy (back-compat для kumho).
2. Italy `config/project.php`: добавить `form_validation` с email/name/city/policy.
3. Italy: удалить override `src/Action/ApiSendAction.php` (через `distill` mark-non-override или ручное удаление из state.json), синкнуть baseline.
4. Verify на italy: форма принимает email-submit, kumho — phone-submit.

## Acceptance

- [ ] `ApiSendAction::validate()` читает `settings::form_validation`
- [ ] Default rules для backward-compat (phone+policy если нет config)
- [ ] kumho config: phone+name+square+policy
- [ ] italy config: email+name+city+policy
- [ ] Unit-тесты на validate() с разными config'ами
- [ ] italy `src/Action/ApiSendAction.php` удалён из overrides — единый baseline
- [ ] ADR-0008 после принятия

## Связано

- ADR-0005 (notification channels) — Dispatcher тоже мог бы получать `channels_filter` per-deployment (CallTouch только для kumho, и т.п.)
- В дальнейшем — frontend validation.js тоже читать rules из API endpoint (`/api/form-schema`) или из window.config — single source of truth для front+back.
