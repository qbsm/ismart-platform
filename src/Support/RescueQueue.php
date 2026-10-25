<?php

declare(strict_types=1);

namespace App\Support;

use Psr\Log\LoggerInterface;

/**
 * Файловая очередь заявок, которые не дошли до приёмника api.ismart.pro (RescueChannel).
 *
 * 21–24.10.2026 пять заявок avtofin не попали в приёмник: сервер сайта не смог за 3 с найти адрес
 * api.ismart.pro (DNS) или не дождался ответа, а канал слал один раз. Заказчик их получил — почта и
 * CRM отработали, — но приёмник, его досыл и аналитика их не видели. Не дошедшая заявка ложится
 * сюда и досылается после ответа посетителю, после следующей заявки и таймером
 * (`php tools/ops/rescue.php flush`). Приёмник отверг (4xx) или заявка ждёт дольше недели —
 * запись откладывается в rejected-файл: бесследно ничего не пропадает.
 *
 * Запись: {t: когда легла, kind, payload: тело запроса в приёмник как есть}. kind=lead — сама заявка,
 * kind=channels — итоги каналов по ней (/channels): приёмник принимает их только к уже известной
 * заявке (иначе 404), поэтому они стоят в очереди следом за заявкой и уходят после неё. Ключ —
 * kind + payload.request_id: приёмник по request_id отличает повтор, повторная доставка дубля не создаст.
 */
final class RescueQueue
{
    public const SENT = 'sent';
    public const RETRY = 'retry';
    public const REJECT = 'reject';
    public const LEAD = 'lead';
    public const CHANNELS = 'channels';

    private const KEEP_SECONDS = 7 * 86400;
    private const BATCH = 10;
    private const QUEUE_BYTES = 2 * 1024 * 1024;
    private const REJECTED_BYTES = 1024 * 1024;

    private string $queueFile;
    private string $lockFile;
    private string $rejectedFile;

    public function __construct(
        private readonly LoggerInterface $logger,
        string $dir,
    ) {
        $dir = rtrim($dir, '/');
        $this->queueFile = $dir . '/rescue_queue.log';
        $this->lockFile = $dir . '/rescue_flush.lock';
        $this->rejectedFile = $dir . '/rescue_rejected.log';
    }

    /**
     * @param array<string,mixed> $payload
     */
    public function enqueue(array $payload, string $kind = self::LEAD): bool
    {
        $requestId = (string) ($payload['request_id'] ?? '');
        if ($requestId === '') {
            return false;
        }
        @mkdir(dirname($this->queueFile), 0o775, true);
        clearstatcache(true, $this->queueFile);
        if ((int) @filesize($this->queueFile) > self::QUEUE_BYTES) {
            $this->logger->warning('Rescue: очередь переполнена, заявка не записана', ['request_id' => $requestId]);
            return false;
        }
        // Перевод строки и перед записью: оборванная прошлая запись не склеится с новой.
        $line = "\n" . self::encode(['t' => time(), 'kind' => $kind, 'payload' => $payload]) . "\n";
        if (@file_put_contents($this->queueFile, $line, FILE_APPEND | LOCK_EX) === false) {
            $this->logger->warning('Rescue: очередь недоступна для записи', ['request_id' => $requestId]);
            return false;
        }
        return true;
    }

    /** Заявка с этим request_id ещё ждёт доставки. */
    public function hasLead(string $requestId): bool
    {
        foreach ($this->items() as $item) {
            if ($item['kind'] === self::LEAD && (string) ($item['payload']['request_id'] ?? '') === $requestId) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return list<array{t:int, kind:string, payload:array<string,mixed>}>
     */
    public function items(): array
    {
        $content = @file_get_contents($this->queueFile);
        return $content === false ? [] : self::decode($content)['items'];
    }

    /**
     * Досылка: $deliver(kind, payload) возвращает SENT, RETRY или REJECT.
     * RETRY заявки останавливает проход — приёмник недоступен, остальные подождут; итоги каналов за
     * ней не уйдут раньше неё. RETRY итогов проход не останавливает: они ждут свою заявку, а не
     * держат чужие. Итоги отвергнутой заявки отбрасываются — сшивать не с чем.
     *
     * @param callable(string, array<string,mixed>): string $deliver
     * @return array{sent:int, left:int}
     */
    public function flush(callable $deliver): array
    {
        $result = ['sent' => 0, 'left' => 0];
        if (!is_file($this->queueFile)) {
            return $result;
        }
        $lock = @fopen($this->lockFile, 'c');
        if ($lock === false) {
            return $result;
        }
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            $result['left'] = count($this->items());
            return $result;
        }

        $done = [];
        $rejected = [];
        $tried = 0;
        foreach ($this->items() as $item) {
            $requestId = (string) ($item['payload']['request_id'] ?? '');
            $key = self::key($item);
            if ($item['t'] > 0 && time() - $item['t'] > self::KEEP_SECONDS) {
                if ($this->setAside('не ушла за неделю', self::encode($item))) {
                    $done[] = $key;
                }
                $this->logger->warning('Rescue: запись прождала неделю и отложена', ['request_id' => $requestId]);
                continue;
            }
            if ($item['kind'] === self::CHANNELS && isset($rejected[$requestId])) {
                $done[] = $key;
                continue;
            }
            if ($tried++ >= self::BATCH) {
                break;
            }
            $outcome = $deliver($item['kind'], $item['payload']);
            if ($outcome === self::SENT) {
                $done[] = $key;
                if ($item['kind'] === self::LEAD) {
                    $result['sent']++;
                }
            } elseif ($outcome === self::REJECT) {
                if ($this->setAside('отклонено приёмником', self::encode($item))) {
                    $done[] = $key;
                }
                $rejected[$requestId] = true;
            } elseif ($item['kind'] === self::LEAD) {
                break;
            }
        }

        if ($done !== []) {
            $this->drop($done);
        }
        $result['left'] = count($this->items());
        flock($lock, LOCK_UN);
        fclose($lock);
        return $result;
    }

    /**
     * @param list<string> $keys
     */
    private function drop(array $keys): void
    {
        $fp = @fopen($this->queueFile, 'c+');
        if ($fp === false) {
            return;
        }
        if (flock($fp, LOCK_EX)) {
            $parsed = self::decode((string) stream_get_contents($fp));
            $keep = '';
            foreach ($parsed['items'] as $item) {
                if (!in_array(self::key($item), $keys, true)) {
                    $keep .= self::encode($item) . "\n";
                }
            }
            foreach ($parsed['broken'] as $line) {
                if (!$this->setAside('нечитаемая строка очереди', $line)) {
                    $keep .= $line . "\n";
                }
            }
            rewind($fp);
            fwrite($fp, $keep);
            fflush($fp);
            ftruncate($fp, strlen($keep));
            flock($fp, LOCK_UN);
        }
        fclose($fp);
    }

    private function setAside(string $why, string $line): bool
    {
        clearstatcache(true, $this->rejectedFile);
        if ((int) @filesize($this->rejectedFile) > self::REJECTED_BYTES) {
            @rename($this->rejectedFile, substr($this->rejectedFile, 0, -4) . '.old.log');
        }
        return @file_put_contents($this->rejectedFile, date('Y-m-d H:i:s') . ' ' . $why . ' ' . $line . "\n", FILE_APPEND | LOCK_EX) !== false;
    }

    /**
     * @param array{kind:string, payload:array<string,mixed>} $item
     */
    private static function key(array $item): string
    {
        return $item['kind'] . ':' . (string) ($item['payload']['request_id'] ?? '');
    }

    /**
     * @return array{items: list<array{t:int, kind:string, payload:array<string,mixed>}>, broken: list<string>}
     */
    private static function decode(string $content): array
    {
        $items = [];
        $broken = [];
        foreach (explode("\n", $content) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $item = json_decode($line, true);
            if (is_array($item) && is_array($item['payload'] ?? null) && (string) ($item['payload']['request_id'] ?? '') !== '') {
                $kind = ($item['kind'] ?? self::LEAD) === self::CHANNELS ? self::CHANNELS : self::LEAD;
                $items[] = ['t' => (int) ($item['t'] ?? 0), 'kind' => $kind, 'payload' => $item['payload']];
            } else {
                $broken[] = $line;
            }
        }
        return ['items' => $items, 'broken' => $broken];
    }

    /**
     * @param array<string,mixed> $value
     */
    private static function encode(array $value): string
    {
        return (string) json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    }
}
