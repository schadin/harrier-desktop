import { CoreError } from '@harrier/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimitedActions } from './matrix';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const retryDelay = async (
  waitMs: number,
  action: () => Promise<void>,
  assertBeforeRetry: () => void
) => {
  const promise = action();
  await vi.advanceTimersByTimeAsync(waitMs - 1);
  assertBeforeRetry();
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(1);
  await vi.runAllTimersAsync();
  await promise;
};

describe('rateLimitedActions', () => {
  it.each([
    {
      name: 'normalized retryAfterMs',
      error: new CoreError('rate-limited', 'Slow down', true, 429, 'M_LIMIT_EXCEEDED', {}, 1250),
      waitMs: 1250,
    },
    {
      name: 'legacy plain data',
      error: new CoreError('rate-limited', 'Slow down', true, 429, 'M_LIMIT_EXCEEDED', {
        retry_after_ms: 800,
      }),
      waitMs: 800,
    },
    {
      name: 'default delay',
      error: new CoreError('rate-limited', 'Slow down', true, 429, 'M_LIMIT_EXCEEDED'),
      waitMs: 3000,
    },
  ])('retries the same item using $name', async ({ error, waitMs }) => {
    vi.useFakeTimers();
    const callback = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);

    await retryDelay(
      waitMs,
      () => rateLimitedActions(['room'], callback),
      () => expect(callback).toHaveBeenCalledTimes(1)
    );

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls).toEqual([
      ['room', 0],
      ['room', 0],
    ]);
  });

  it('preserves raw SDK 429 retry timing without importing SDK types', async () => {
    vi.useFakeTimers();
    const rawError = {
      httpStatus: 429,
      data: { retry_after_ms: 250 },
      getRetryAfterMs: () => 1200,
    };
    const callback = vi.fn().mockRejectedValueOnce(rawError).mockResolvedValueOnce(undefined);

    await retryDelay(
      1200,
      () => rateLimitedActions(['room'], callback),
      () => expect(callback).toHaveBeenCalledTimes(1)
    );

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'legacy data',
      rawError: {
        httpStatus: 429,
        data: { retry_after_ms: 600 },
        getRetryAfterMs: (): null => null,
      },
      waitMs: 600,
    },
    {
      name: 'default delay',
      rawError: { httpStatus: 429, data: {}, getRetryAfterMs: (): null => null },
      waitMs: 3000,
    },
  ])('preserves raw SDK $name fallback', async ({ rawError, waitMs }) => {
    vi.useFakeTimers();
    const callback = vi.fn().mockRejectedValueOnce(rawError).mockResolvedValueOnce(undefined);

    await retryDelay(
      waitMs,
      () => rateLimitedActions(['room'], callback),
      () => expect(callback).toHaveBeenCalledTimes(1)
    );

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('keeps the per-item retry counter and action interval', async () => {
    vi.useFakeTimers();
    const callback = vi
      .fn()
      .mockRejectedValueOnce(new CoreError('rate-limited', 'Slow down', true, 429))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new CoreError('rate-limited', 'Slow down', true, 429))
      .mockResolvedValueOnce(undefined);

    const promise = rateLimitedActions(['first', 'second'], callback, 1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(callback).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4499);
    expect(callback).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(3);
    await vi.runAllTimersAsync();
    await promise;

    expect(callback.mock.calls).toEqual([
      ['first', 0],
      ['first', 0],
      ['second', 1],
      ['second', 1],
    ]);
  });

  it('propagates non-rate-limit CoreError without retrying', async () => {
    const error = new CoreError('forbidden', 'Forbidden');
    const callback = vi.fn().mockRejectedValue(error);

    await expect(rateLimitedActions(['room'], callback)).rejects.toBe(error);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('preserves legacy non-429 callback behavior', async () => {
    const callback = vi
      .fn()
      .mockRejectedValueOnce({ httpStatus: 403, data: { error: 'Forbidden' } })
      .mockResolvedValueOnce(undefined);

    await rateLimitedActions(['first', 'second'], callback);

    expect(callback.mock.calls).toEqual([
      ['first', 0],
      ['second', 1],
    ]);
  });
});
