<?php

declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Работа «после ответа»: задачи выполняются, когда посетитель уже получил ответ формы.
 *
 * Медленные получатели заявки (импорт в Метрику, очередь CRM) не должны держать кнопку
 * «Отправить». Под FPM/LiteSpeed соединение закрывается до запуска задач; на встроенном
 * сервере PHP — задачи просто доезжают в конце запроса. Ошибка задачи наружу не выходит.
 *
 * Под Apache с mod_php (прод avtofin) закрыть соединение из PHP нечем — посетитель ждал все задачи:
 * досылку CRM и загрузку в Метрику, 25.10.2026 медиана отправки формы была 8 с. Там ответ уходит с
 * точной длиной и `Connection: close` (AfterResponseMiddleware) и проталкивается до задач: браузер
 * получает его целиком и не ждёт конца соединения.
 */
final class AfterResponse
{
    /** @var array<int, callable(): mixed> */
    private static array $tasks = [];

    private static bool $registered = false;

    /**
     * @param callable(): mixed $task
     */
    public static function defer(callable $task): void
    {
        self::$tasks[] = $task;
        if (!self::$registered) {
            self::$registered = true;
            register_shutdown_function([self::class, 'run']);
        }
    }

    /** Задачи есть — ответ должен уйти раньше них. */
    public static function pending(): bool
    {
        return self::$tasks !== [];
    }

    /** SAPI сам закрывает соединение с посетителем до задач (FPM, LiteSpeed). */
    public static function canFinishRequest(): bool
    {
        return function_exists('fastcgi_finish_request') || function_exists('litespeed_finish_request');
    }

    public static function run(): void
    {
        if (self::$tasks === []) {
            return;
        }

        // До проталкивания: прокси, получив ответ целиком, может закрыть соединение, и без этого
        // PHP оборвал бы задачи.
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        } else {
            while (ob_get_level() > 0) {
                @ob_end_flush();
            }
            flush();
        }
        @set_time_limit(60);

        self::runTasks();
    }

    /**
     * Сами задачи, без работы с соединением (её делает run). Поставленные по ходу задачи тоже
     * выполняются — по порядку постановки.
     */
    public static function runTasks(): void
    {
        while (self::$tasks !== []) {
            $task = array_shift(self::$tasks);
            try {
                $task();
            } catch (Throwable $e) {
                error_log('after-response: ' . $e->getMessage());
            }
        }
    }

    private function __construct() {}
}
