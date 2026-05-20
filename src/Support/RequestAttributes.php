<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Константы атрибутов request'а и ключей, разбросанных по приложению.
 * Цель — убрать magic-строки и обеспечить единое место для рефакторинга.
 */
final class RequestAttributes
{
    public const CSRF_TOKEN = 'csrf_token';
    public const REQUEST_ID = 'request_id';
    public const LANG_CODE = 'lang_code';
    public const BASE_URL = 'base_url';
    public const PAGE_ID = 'page_id';
    public const ROUTE_PARAMS = 'route_params';
    public const CURRENT_LANG = 'current_lang';
    public const IS_LANG_IN_URL = 'is_lang_in_url';

    private function __construct()
    {
    }
}
