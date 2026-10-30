import { describe, expect, it } from 'vitest';
import { CoreError, toCoreError } from './error';

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
