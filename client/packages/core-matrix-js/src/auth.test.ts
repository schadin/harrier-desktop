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
});
