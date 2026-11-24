import { expect } from 'vitest';
import { contractTest } from '../suite';

export const mediaCases = [
  contractTest('media config and authentication flag are exposed as views', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.media.config.getSnapshot().value).toEqual({});
      expect(core.media.authenticated.getSnapshot().value).toBe(true);
      const refreshed = await core.media.refreshConfig();
      expect(refreshed.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('media resolution and preview do not expose SDK handles', async (harness) => {
    const core = await harness.create();
    try {
      const invalid = await core.media.resolve({ mxcUrl: 'not-an-mxc' });
      expect(invalid.ok).toBe(false);
      const preview = await core.media.getUrlPreview('https://example.org', 0);
      expect(preview.ok).toBe(true);
      const missingName = await core.media.download({ mxcUrl: 'mxc://example.org/file' }, '');
      expect(missingName.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('media URL is a synchronous HTTP(S) URL', async (harness) => {
    const core = await harness.create();
    try {
      const url = core.media.url({ mxcUrl: 'mxc://example.org/file' });
      expect(typeof url).toBe('string');
      expect(url).toMatch(/^https?:\/\//);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('media URL returns null for an invalid MXC', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.media.url({ mxcUrl: 'not-an-mxc' })).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('media URL does not bypass encrypted attachment decryption', async (harness) => {
    const core = await harness.create();
    try {
      expect(
        core.media.url({
          mxcUrl: 'mxc://example.org/file',
          encrypted: {
            url: 'mxc://example.org/file',
            key: { kty: 'oct', k: 'secret' },
            iv: 'initialization-vector',
          },
        })
      ).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),
];
