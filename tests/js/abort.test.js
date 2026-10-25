import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAbortController, withTimeout } from '../../assets/js/components/form-callback/abort.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createAbortController', () => {
  it('настоящий, когда браузер его знает', () => {
    expect(createAbortController()).toBeInstanceOf(AbortController);
  });
  it('без AbortController (Chrome < 66) — заглушка без сигнала, abort() не бросает', () => {
    vi.stubGlobal('AbortController', undefined);
    const c = createAbortController();
    expect(c.signal).toBeUndefined();
    expect(() => c.abort()).not.toThrow();
  });
});

describe('withTimeout', () => {
  it('быстрый ответ проходит', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
  it('ошибка запроса не подменяется тайм-аутом', async () => {
    await expect(withTimeout(Promise.reject(new Error('net')), 1000)).rejects.toThrow('net');
  });
  it('долгий ответ — AbortError и onTimeout, как у отменённого fetch', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const p = withTimeout(new Promise(() => {}), 500, onTimeout);
    vi.advanceTimersByTime(500);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
