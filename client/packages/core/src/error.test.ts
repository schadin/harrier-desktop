import { describe, expect, it } from 'vitest';
import { CoreError, toCoreError, type CoreErrorCode } from './error';

const stableCodes: CoreErrorCode[] = [
  'unknown',
  'network',
  'unauthorized',
  'forbidden',
  'not-found',
  'invalid-request',
  'conflict',
  'rate-limited',
  'unsupported',
  'cancelled',
];

describe('CoreError', () => {
  it.each(stableCodes)('supports the stable %s code', (code) => {
    const error = new CoreError(code, 'Failure');
    expect(error.code).toBe(code);
  });

  it('preserves retry metadata in the final constructor argument', () => {
    const data = { retry_after_ms: 1250, context: { source: 'test' } };
    const error = new CoreError(
      'rate-limited',
      'Slow down',
      true,
      429,
      'M_LIMIT_EXCEEDED',
      data,
      1250
    );

    expect(error).toMatchObject({
      code: 'rate-limited',
      message: 'Slow down',
      retryable: true,
      httpStatus: 429,
      errcode: 'M_LIMIT_EXCEEDED',
      retryAfterMs: 1250,
    });
    expect(error.data).toBe(data);
  });
});

describe('toCoreError', () => {
  it('returns CoreError unchanged', () => {
    const err = new CoreError('network', 'offline', true);
    expect(toCoreError(err)).toBe(err);
  });

  it('wraps unknown values as non-retryable unknown errors', () => {
    const err = toCoreError('boom');
    expect(err).toBeInstanceOf(CoreError);
    expect(err.code).toBe('unknown');
    expect(err.message).toBe('boom');
    expect(err.retryable).toBe(false);
  });
});
