import { MatrixClient, MatrixError } from 'matrix-js-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthOperations } from './auth';

describe('createAuthOperations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('discovers a homeserver without exposing the SDK client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ 'm.homeserver': { base_url: 'https://matrix.example.org' } }),
      }))
    );
    const result = await createAuthOperations().discover('example.org');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value?.['m.homeserver'].base_url).toBe('https://matrix.example.org');
  });

  it('builds SSO URLs and media URLs through the adapter', () => {
    const auth = createAuthOperations();
    expect(
      auth.ssoUrl('https://matrix.example.org', 'https://client.example.org', undefined, 'login')
    ).toContain('/_matrix/client/v3/login/sso/redirect');
    expect(auth.mediaUrl('https://matrix.example.org', 'mxc://example.org/avatar')).toContain(
      '/_matrix/media/v3/thumbnail'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [400, 'M_BAD_JSON', 'InvalidRequest', 'invalid-request', false],
    [429, 'M_LIMIT_EXCEEDED', 'RateLimited', 'rate-limited', true],
    [403, 'M_FORBIDDEN', 'Forbidden', 'forbidden', false],
    [undefined, 'M_USER_DEACTIVATED', 'UserDeactivated', 'unknown', false],
  ] as const)(
    'keeps the login alias for HTTP %i / %s while carrying normalized metadata',
    async (httpStatus, errcode, alias, code, retryable) => {
      const data = { errcode, error: 'Server message', retry_after_ms: 900 };
      vi.spyOn(MatrixClient.prototype, 'loginRequest').mockRejectedValueOnce(
        new MatrixError(data, httpStatus)
      );

      const result = await createAuthOperations().login('https://matrix.example.org', {
        type: 'm.login.password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code,
          message: alias,
          retryable,
          httpStatus,
          errcode: alias,
          data,
        });
        if (retryable) expect(result.error.retryAfterMs).toBe(900);
        expect('cause' in result.error).toBe(false);
      }
    }
  );

  it.each([
    ['M_USER_IN_USE', 'UserTaken'],
    ['M_INVALID_USERNAME', 'UserInvalid'],
    ['M_EXCLUSIVE', 'UserExclusive'],
    ['M_WEAK_PASSWORD', 'PasswordWeak'],
    ['M_PASSWORD_TOO_SHORT', 'PasswordShort'],
  ])('keeps the registration alias for %s', async (errcode, alias) => {
    const data = { errcode, error: 'Registration failed' };
    vi.spyOn(MatrixClient.prototype, 'registerRequest').mockRejectedValueOnce(
      new MatrixError(data, 400)
    );

    const result = await createAuthOperations().register('https://matrix.example.org', {
      type: 'm.login.password',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'invalid-request',
        message: 'Registration failed',
        retryable: false,
        httpStatus: 400,
        errcode: alias,
        data,
      });
    }
  });

  it('carries rate-limit metadata through the registration alias', async () => {
    const data = { errcode: 'M_LIMIT_EXCEEDED', error: 'Too many attempts', retry_after_ms: 1500 };
    vi.spyOn(MatrixClient.prototype, 'registerRequest').mockRejectedValueOnce(
      new MatrixError(data, 429)
    );

    const result = await createAuthOperations().register('https://matrix.example.org', {
      type: 'm.login.password',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'rate-limited',
        message: 'Too many attempts',
        retryable: true,
        httpStatus: 429,
        errcode: 'RateLimited',
        retryAfterMs: 1500,
        data,
      });
    }
  });

  it.each([500, undefined])(
    'keeps M_USER_DEACTIVATED registration fallback Unknown for HTTP %s',
    async (httpStatus) => {
      const data = { errcode: 'M_USER_DEACTIVATED', error: 'Registration failed' };
      vi.spyOn(MatrixClient.prototype, 'registerRequest').mockRejectedValueOnce(
        new MatrixError(data, httpStatus)
      );

      const result = await createAuthOperations().register('https://matrix.example.org', {
        type: 'm.login.password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: 'unknown',
          message: 'Registration failed',
          retryable: httpStatus === 500,
          httpStatus,
          errcode: 'Unknown',
          data,
        });
      }
    }
  );

  it.each(['__proto__', 'constructor', 'toString'])(
    'does not read inherited register aliases for %s',
    async (errcode) => {
      const data = { errcode, error: 'Registration failed' };
      vi.spyOn(MatrixClient.prototype, 'registerRequest').mockRejectedValueOnce(
        new MatrixError(data, 400)
      );

      const result = await createAuthOperations().register('https://matrix.example.org', {
        type: 'm.login.password',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: 'invalid-request',
          message: 'Registration failed',
          errcode: 'InvalidRequest',
          data,
        });
      }
    }
  );

  it('preserves registration and password UIA responses', async () => {
    const auth = { session: 'uia-session', flows: [{ stages: ['m.login.password'] }] };
    vi.spyOn(MatrixClient.prototype, 'registerRequest').mockRejectedValueOnce(
      new MatrixError({ errcode: 'M_UNAUTHORIZED', error: 'Continue', ...auth }, 401)
    );
    vi.spyOn(MatrixClient.prototype, 'setPassword').mockRejectedValueOnce(
      new MatrixError({ errcode: 'M_UNAUTHORIZED', error: 'Continue', ...auth }, 401)
    );

    const registered = await createAuthOperations().register('https://matrix.example.org', {
      type: 'm.login.password',
    });
    const reset = await createAuthOperations().setPassword(
      'https://matrix.example.org',
      {},
      'new-password',
      true
    );

    const authData = { errcode: 'M_UNAUTHORIZED', error: 'Continue', ...auth };
    expect(registered).toEqual({ ok: true, value: { auth: authData } });
    expect(reset).toEqual({ ok: true, value: { auth: authData } });
  });

  it('normalizes password errors without changing their existing message or errcode', async () => {
    const data = { errcode: 'M_LIMIT_EXCEEDED', error: 'Slow down', retry_after_ms: 700 };
    vi.spyOn(MatrixClient.prototype, 'setPassword').mockRejectedValueOnce(
      new MatrixError(data, 429)
    );

    const result = await createAuthOperations().setPassword(
      'https://matrix.example.org',
      {},
      'new-password',
      true
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'rate-limited',
        message: 'M_LIMIT_EXCEEDED',
        retryable: true,
        httpStatus: 429,
        errcode: 'M_LIMIT_EXCEEDED',
        retryAfterMs: 700,
        data,
      });
    }
  });
});
