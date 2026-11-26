import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver, type SyncDriver } from './testing/driver';

let driver: SyncDriver | undefined;

afterEach(() => {
  driver?.client.stopClient();
  driver = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('matrix-js media URL', () => {
  it('forwards dimensions, resize method, and URL options to the SDK', async () => {
    driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    await vi.waitFor(() => {
      expect(core.media.authenticated.getSnapshot().value).toBe(true);
    });
    const mxcUrlToHttp = vi.spyOn(driver.client, 'mxcUrlToHttp');

    const url = core.media.url(
      { mxcUrl: 'mxc://example.org/file', width: 320, height: 180, resizeMethod: 'crop' },
      { useAuthentication: false, allowDirectLinks: true, allowRedirects: false }
    );

    expect(mxcUrlToHttp).toHaveBeenCalledWith(
      'mxc://example.org/file',
      320,
      180,
      'crop',
      true,
      false,
      false
    );
    expect(url).toBe(
      'https://matrix.example.org/_matrix/media/v3/thumbnail/example.org/file?width=320&height=180&method=crop&allow_redirect=false'
    );
  });

  it('uses the same authenticated-media default as media resolution', async () => {
    driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    await vi.waitFor(() => {
      expect(core.media.authenticated.getSnapshot().value).toBe(true);
    });
    const mxcUrlToHttp = vi.spyOn(driver.client, 'mxcUrlToHttp');

    const url = core.media.url({ mxcUrl: 'mxc://example.org/file' });

    expect(mxcUrlToHttp).toHaveBeenCalledWith(
      'mxc://example.org/file',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true
    );
    expect(url).toBe(
      'https://matrix.example.org/_matrix/client/v1/media/download/example.org/file?allow_redirect=true'
    );
  });
});

describe('matrix-js media failures', () => {
  const encryptedRef = {
    mxcUrl: 'mxc://example.org/encrypted',
    encrypted: {
      url: 'mxc://example.org/encrypted',
      key: { kty: 'oct', k: 'secret' },
      iv: 'initialization-vector',
    },
  };

  it('preserves Retry-After seconds from encrypted resolve responses', async () => {
    driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429, headers: { 'Retry-After': '2' } }))
    );

    const result = await core.media.resolve(encryptedRef);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'rate-limited',
        retryable: true,
        httpStatus: 429,
        retryAfterMs: 2000,
        data: { error: 'Media request failed: 429' },
      });
      expect('cause' in result.error).toBe(false);
    }
  });

  it('preserves an HTTP-date Retry-After from download responses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00.000Z'));
    driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            status: 429,
            headers: { 'Retry-After': 'Thu, 26 Nov 2026 12:00:05 GMT' },
          })
      )
    );

    const result = await core.media.download({ mxcUrl: 'mxc://example.org/file' }, 'file');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'rate-limited',
        retryable: true,
        httpStatus: 429,
        retryAfterMs: 5000,
        data: { error: 'Media request failed: 429' },
      });
    }
  });

  it.each([500, 503])('marks media HTTP %i responses retryable', async (httpStatus) => {
    driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: httpStatus }))
    );

    const result = await core.media.resolve(encryptedRef);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: 'unknown',
        retryable: true,
        httpStatus,
        data: { error: `Media request failed: ${httpStatus}` },
      });
    }
  });
});
