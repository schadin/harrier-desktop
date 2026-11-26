import { MatrixError } from 'matrix-js-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreError } from '@harrier/core';
import { normalizeMatrixError } from './error';

afterEach(() => {
  vi.useRealTimers();
});

const normalizeRateLimitHeader = (header: string, retryAfterMs = 450) =>
  normalizeMatrixError(
    new MatrixError(
      { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down', retry_after_ms: retryAfterMs },
      429,
      undefined,
      undefined,
      new Headers({ 'Retry-After': header })
    )
  );

describe('normalizeMatrixError', () => {
  it.each([
    [400, 'M_BAD_JSON', 'invalid-request', false],
    [401, 'M_UNKNOWN_TOKEN', 'unauthorized', false],
    [403, 'M_FORBIDDEN', 'forbidden', false],
    [404, 'M_NOT_FOUND', 'not-found', false],
    [409, 'M_UNKNOWN', 'conflict', false],
    [429, 'M_LIMIT_EXCEEDED', 'rate-limited', true],
  ] as const)('maps HTTP %i with %s to %s', (httpStatus, errcode, code, retryable) => {
    const data = { errcode, error: 'Server failure', detail: { attempt: 2 } };
    const error = normalizeMatrixError(new MatrixError(data, httpStatus));

    expect(error).toBeInstanceOf(CoreError);
    expect(error).toMatchObject({
      code,
      message: 'Server failure',
      retryable,
      httpStatus,
      errcode,
    });
    expect(error.data).toEqual(data);
    expect(error.data).not.toBe(data);
    expect('cause' in error).toBe(false);
  });

  it('uses M_LIMIT_EXCEEDED and retry_after_ms without an HTTP status', () => {
    const error = normalizeMatrixError(
      new MatrixError({
        errcode: 'M_LIMIT_EXCEEDED',
        error: 'Slow down',
        retry_after_ms: 1200,
      })
    );

    expect(error).toMatchObject({
      code: 'rate-limited',
      retryable: true,
      retryAfterMs: 1200,
      errcode: 'M_LIMIT_EXCEEDED',
    });
    expect(
      normalizeMatrixError(
        new MatrixError({ errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down' }, 400)
      )
    ).toMatchObject({ code: 'rate-limited', retryable: true, httpStatus: 400 });
  });

  it('reads Retry-After seconds before legacy data', () => {
    const error = normalizeMatrixError(
      new MatrixError(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down', retry_after_ms: 400 },
        429,
        undefined,
        undefined,
        new Headers({ 'Retry-After': '2' })
      )
    );

    expect(error.retryAfterMs).toBe(2000);
  });

  it('reads an HTTP-date Retry-After header and clamps past dates to zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    const future = normalizeMatrixError(
      new MatrixError(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down' },
        429,
        undefined,
        undefined,
        new Headers({ 'Retry-After': 'Thu, 26 Nov 2026 12:00:05 GMT' })
      )
    );
    const past = normalizeMatrixError(
      new MatrixError(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down' },
        429,
        undefined,
        undefined,
        new Headers({ 'Retry-After': 'Thu, 26 Nov 2026 11:59:59 GMT' })
      )
    );

    expect(future.retryAfterMs).toBe(5000);
    expect(past.retryAfterMs).toBe(0);
  });

  it.each([
    ['IMF-fixdate', 'Thu, 26 Nov 2026 12:00:05 GMT'],
    ['RFC850', 'Thursday, 26-Nov-26 12:00:05 GMT'],
    ['asctime', 'Thu Nov 26 12:00:05 2026'],
  ])('parses %s HTTP dates as UTC', (_format, header) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    expect(normalizeRateLimitHeader(header).retryAfterMs).toBe(5000);
  });

  it('parses a space-padded asctime day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T12:00:00.000Z'));

    expect(normalizeRateLimitHeader('Fri Nov  6 12:00:05 2026').retryAfterMs).toBe(5000);
  });

  it.each(['Thursday, 26-Nov-26 11:59:59 GMT', 'Thu Nov 26 11:59:59 2026'])(
    'clamps past obs-date %s to zero',
    (header) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

      expect(normalizeRateLimitHeader(header).retryAfterMs).toBe(0);
    }
  );

  it('applies the RFC850 two-digit year boundary relative to the current year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    expect(normalizeRateLimitHeader('Thursday, 26-Nov-26 12:00:05 GMT').retryAfterMs).toBe(5000);
    expect(normalizeRateLimitHeader('Thursday, 26-Nov-77 12:00:05 GMT').retryAfterMs).toBe(0);
  });

  it.each([
    'Thu, 31 Feb 2026 12:00:05 GMT',
    'Thursday, 31-Feb-26 12:00:05 GMT',
    'Thu Feb 31 12:00:05 2026',
    'Thu, 26 Nov 2026 24:00:00 GMT',
    'Thursday, 26 Nov 26 12:00:05 GMT',
    'Thu Nov 6 12:00:05 2026',
  ])('rejects impossible or malformed HTTP date %s and keeps the fallback', (header) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));

    expect(normalizeRateLimitHeader(header).retryAfterMs).toBe(450);
  });

  it('ignores malformed Retry-After values and falls back to legacy data', () => {
    const malformed = normalizeMatrixError(
      new MatrixError(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down' },
        429,
        undefined,
        undefined,
        new Headers({ 'Retry-After': 'not-a-date' })
      )
    );
    const fallback = normalizeMatrixError(
      new MatrixError(
        { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down', retry_after_ms: 450 },
        429,
        undefined,
        undefined,
        new Headers({ 'Retry-After': 'not-a-date' })
      )
    );

    expect(malformed.retryAfterMs).toBeUndefined();
    expect(fallback.retryAfterMs).toBe(450);
  });

  it.each(['-1', '1.5', '+2'])(
    'rejects numeric-like Retry-After %s and falls back to legacy data',
    (header) => {
      const error = normalizeMatrixError(
        new MatrixError(
          { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down', retry_after_ms: 450 },
          429,
          undefined,
          undefined,
          new Headers({ 'Retry-After': header })
        )
      );

      expect(error.retryAfterMs).toBe(450);
    }
  );

  it('prefers a direct retryAfterMs and safely reads legacy retry methods', () => {
    const direct = Object.assign(new Error('Slow down'), {
      httpStatus: 429,
      retryAfterMs: 700,
      getRetryAfterMs: () => 800,
      data: { retry_after_ms: 900 },
    });
    const legacy = Object.assign(new Error('Slow down'), {
      httpStatus: 429,
      getRetryAfterMs: () => 800,
      data: { retry_after_ms: 900 },
    });
    const invalid = Object.assign(new Error('Slow down'), {
      httpStatus: 429,
      retryAfterMs: Number.NaN,
      getRetryAfterMs: () => {
        throw new Error('Invalid retry metadata');
      },
      data: { retry_after_ms: -1 },
    });

    expect(normalizeMatrixError(direct).retryAfterMs).toBe(700);
    expect(normalizeMatrixError(legacy).retryAfterMs).toBe(800);
    expect(normalizeMatrixError(invalid).retryAfterMs).toBeUndefined();
  });

  it('marks TypeError, 408 and 5xx failures retryable but ordinary 4xx failures not retryable', () => {
    expect(normalizeMatrixError(new TypeError('Failed to fetch'))).toMatchObject({
      code: 'network',
      retryable: true,
    });

    [408, 500, 503].forEach((httpStatus) => {
      expect(
        normalizeMatrixError(new MatrixError({ error: 'Temporary' }, httpStatus))
      ).toMatchObject({
        code: 'unknown',
        retryable: true,
        httpStatus,
      });
    });

    [400, 401, 403, 404, 409, 418].forEach((httpStatus) => {
      expect(
        normalizeMatrixError(new MatrixError({ error: 'Rejected' }, httpStatus)).retryable
      ).toBe(false);
    });
  });

  it('uses errcode fallbacks only when the HTTP status is absent', () => {
    expect(normalizeMatrixError({ errcode: 'M_FORBIDDEN', error: 'Forbidden' })).toMatchObject({
      code: 'forbidden',
      retryable: false,
    });
    expect(normalizeMatrixError({ errcode: 'M_NOT_FOUND', error: 'Missing' })).toMatchObject({
      code: 'not-found',
      retryable: false,
    });
    expect(
      normalizeMatrixError(new MatrixError({ errcode: 'M_FORBIDDEN', error: 'Server' }, 500))
    ).toMatchObject({ code: 'unknown', retryable: true });
  });

  it('preserves plain data without retaining SDK Error or header objects', () => {
    const data = {
      errcode: 'M_FORBIDDEN',
      error: 'Forbidden',
      nested: { values: [1, 'two', null], enabled: true },
      sdkError: new Error('private SDK detail'),
      headers: new Headers({ 'Retry-After': '2' }),
    };
    const error = normalizeMatrixError(
      new MatrixError(data, 403, undefined, undefined, new Headers({ 'Retry-After': '2' }))
    );

    expect(error.data).toEqual({
      errcode: 'M_FORBIDDEN',
      error: 'Forbidden',
      nested: { values: [1, 'two', null], enabled: true },
    });
    expect('cause' in error).toBe(false);
    expect(error.data).not.toBe(data);
  });

  it('sanitizes __proto__ as an own data key without changing prototypes', () => {
    const data = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"nested":{"__proto__":{"deep":"yes"}}}'
    ) as Record<string, unknown>;
    const error = normalizeMatrixError({ httpStatus: 400, data });
    const sanitized = error.data as Record<string, unknown>;
    const nested = sanitized.nested as Record<string, unknown>;

    const protoData = Object.getOwnPropertyDescriptor(sanitized, '__proto__')?.value;
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(true);
    expect(protoData).toEqual({ polluted: 'yes' });
    expect(Object.getPrototypeOf(protoData)).toBe(Object.prototype);
    expect('polluted' in sanitized).toBe(false);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();

    const nestedProtoData = Object.getOwnPropertyDescriptor(nested, '__proto__')?.value;
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(nested, '__proto__')).toBe(true);
    expect(nestedProtoData).toEqual({ deep: 'yes' });
    expect(Object.getPrototypeOf(nestedProtoData)).toBe(Object.prototype);
    expect('deep' in nested).toBe(false);
  });

  it('normalizes error-shaped plain objects and ordinary errors', () => {
    const shaped = normalizeMatrixError({
      httpStatus: 409,
      errcode: 'M_UNKNOWN',
      error: 'Already exists',
      data: { resource: 'room' },
    });
    const ordinary = normalizeMatrixError(new Error('Something failed'));
    const text = normalizeMatrixError('boom');

    expect(shaped).toMatchObject({
      code: 'conflict',
      message: 'Already exists',
      httpStatus: 409,
      errcode: 'M_UNKNOWN',
      data: { resource: 'room' },
    });
    expect(ordinary).toMatchObject({ code: 'unknown', message: 'Something failed' });
    expect(text).toMatchObject({ code: 'unknown', message: 'boom' });
  });

  it('returns an existing CoreError unchanged', () => {
    const error = new CoreError(
      'cancelled',
      'Cancelled',
      false,
      undefined,
      undefined,
      undefined,
      0
    );
    expect(normalizeMatrixError(error)).toBe(error);
  });
});
