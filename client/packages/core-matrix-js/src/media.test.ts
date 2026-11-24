import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver, type SyncDriver } from './testing/driver';

let driver: SyncDriver | undefined;

afterEach(() => {
  driver?.client.stopClient();
  driver = undefined;
  vi.restoreAllMocks();
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
