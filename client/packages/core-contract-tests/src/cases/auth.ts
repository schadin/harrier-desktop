import { expect, vi } from 'vitest';
import { contractTest } from '../suite';

export const authCases = [
  contractTest(
    'sync retry and logged-out lifecycle are available through core',
    async (harness) => {
      const core = await harness.create();
      try {
        const retry = await core.auth.retrySync();
        expect(retry.ok).toBe(true);
        const off = core.auth.onLoggedOut(() => undefined);
        expect(typeof off).toBe('function');
        off();
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('logout and cache clearing are available through core', async (harness) => {
    const core = await harness.create();
    try {
      const cleared = await core.auth.clearCache();
      expect(cleared.ok).toBe(true);
      const loggedOut = await core.auth.logout();
      expect(loggedOut.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('auth metadata is exposed as a plain view', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.auth.refreshAuthMetadata();
      expect(result.ok).toBe(true);
      expect(core.auth.authMetadata.getSnapshot().value === null).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('capabilities are exposed as a plain view', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.capabilities.getSnapshot().value).toEqual({});
      const refreshed = await core.auth.refreshCapabilities();
      expect(refreshed.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('logout clears the session and stops sync', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.session.getSnapshot().value?.userId).toBe('@tester:example.org');
      const result = await core.auth.logout();
      expect(result.ok).toBe(true);
      expect(core.auth.session.getSnapshot().value).toBeNull();
      expect(core.auth.sync.getSnapshot().value.phase).toBe('stopped');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'UIA fallback auth returns an encoded HTTP(S) URL for the active session',
    async (harness) => {
      const core = await harness.create();
      try {
        const authSessionId = 'uia session+/=&?';
        const fallbackUrl = core.auth.fallbackAuthUrl('m.login.sso', authSessionId);
        expect(fallbackUrl).not.toBeNull();
        const url = new URL(fallbackUrl!);
        expect(['http:', 'https:']).toContain(url.protocol);
        expect(url.pathname).toBe('/_matrix/client/v3/auth/m.login.sso/fallback/web');
        expect(url.searchParams.get('session')).toBe(authSessionId);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('UIA fallback auth returns null for an empty stage or session', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.fallbackAuthUrl('', 'uia-session')).toBeNull();
      expect(core.auth.fallbackAuthUrl('m.login.sso', '')).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('UIA fallback auth returns null after logout', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.fallbackAuthUrl('m.login.sso', 'uia-session')).not.toBeNull();
      const result = await core.auth.logout();
      expect(result.ok).toBe(true);
      expect(core.auth.fallbackAuthUrl('m.login.sso', 'uia-session')).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'UIA fallback auth is repeatable without session mutation or HTTP requests',
    async (harness) => {
      const core = await harness.create();
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      try {
        const sessionBefore = core.auth.session.getSnapshot();
        const first = core.auth.fallbackAuthUrl('m.login.sso', 'uia-session');
        const second = core.auth.fallbackAuthUrl('m.login.sso', 'uia-session');
        expect(first).not.toBeNull();
        expect(second).toBe(first);
        expect(core.auth.session.getSnapshot()).toBe(sessionBefore);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
        await harness.dispose(core);
      }
    }
  ),

  contractTest('3PIDs map homeserver records to typed views in order', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [],
        threepids: [
          {
            medium: 'email',
            address: 'alice@example.org',
            validated_at: 1_700_000_000_001,
            added_at: 1_700_000_000_000,
            bound: true,
          },
          {
            medium: 'msisdn',
            address: '+15550001',
            validated_at: 1_700_000_000_002,
            added_at: 1_700_000_000_003,
            bound: false,
          },
        ],
      });

      const result = await core.auth.threePids();

      expect(result).toEqual({
        ok: true,
        value: [
          {
            medium: 'email',
            address: 'alice@example.org',
            validatedAt: 1_700_000_000_001,
            addedAt: 1_700_000_000_000,
            bound: true,
          },
          {
            medium: 'msisdn',
            address: '+15550001',
            validatedAt: 1_700_000_000_002,
            addedAt: 1_700_000_000_003,
            bound: false,
          },
        ],
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    '3PIDs filter unknown media and malformed addresses without reordering',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [],
          threepids: [
            null,
            'not-a-record',
            [],
            { medium: 'unknown', address: 'unknown@example.org' },
            { medium: 'email' },
            { medium: 'email', address: 42 },
            { medium: 'msisdn', address: ' \t ' },
            { medium: 'email', address: 'first@example.org' },
            { medium: 'msisdn', address: '+15550002' },
            { medium: 'email', address: 'first@example.org' },
          ],
        });

        const result = await core.auth.threePids();

        expect(result).toEqual({
          ok: true,
          value: [
            { medium: 'email', address: 'first@example.org' },
            { medium: 'msisdn', address: '+15550002' },
            { medium: 'email', address: 'first@example.org' },
          ],
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    '3PIDs keep records with missing or invalid optional timestamps',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [],
          threepids: [
            { medium: 'email', address: 'no-times@example.org' },
            {
              medium: 'email',
              address: 'zero@example.org',
              validated_at: 0,
              added_at: 0,
              bound: false,
            },
            {
              medium: 'msisdn',
              address: '+15550003',
              validated_at: Number.NaN,
              added_at: Number.POSITIVE_INFINITY,
              bound: 'false',
            },
            {
              medium: 'email',
              address: 'string-times@example.org',
              validated_at: '1700000000000',
              added_at: null,
            },
          ],
        });

        const result = await core.auth.threePids();

        expect(result).toEqual({
          ok: true,
          value: [
            { medium: 'email', address: 'no-times@example.org' },
            {
              medium: 'email',
              address: 'zero@example.org',
              validatedAt: 0,
              addedAt: 0,
              bound: false,
            },
            { medium: 'msisdn', address: '+15550003' },
            { medium: 'email', address: 'string-times@example.org' },
          ],
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('3PIDs return an empty list for missing or malformed arrays', async (harness) => {
    const core = await harness.create();
    try {
      const missing = await core.auth.threePids();
      expect(missing).toEqual({ ok: true, value: [] });

      await harness.applySyncFixture({ rooms: [], threepids: null });
      expect(await core.auth.threePids()).toEqual({ ok: true, value: [] });

      await harness.applySyncFixture({ rooms: [], threepids: { medium: 'email' } });
      expect(await core.auth.threePids()).toEqual({ ok: true, value: [] });
    } finally {
      await harness.dispose(core);
    }
  }),

  ...(
    [
      [401, 'M_UNAUTHORIZED', 'unauthorized', false, undefined],
      [403, 'M_FORBIDDEN', 'forbidden', false, undefined],
      [429, 'M_LIMIT_EXCEEDED', 'rate-limited', true, 1200],
    ] as const
  ).map(([httpStatus, errcode, code, retryable, retryAfterMs]) =>
    contractTest(`3PID HTTP ${httpStatus} failures normalize to ${code}`, async (harness) => {
      const core = await harness.create();
      try {
        harness.failNextOperation('/account/3pid', {
          operation: '/account/3pid',
          httpStatus,
          errcode,
          error: '3PID request failed',
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        });

        const result = await core.auth.threePids();

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatchObject({
            code,
            retryable,
            httpStatus,
            errcode,
            message: '3PID request failed',
          });
          if (retryAfterMs !== undefined) expect(result.error.retryAfterMs).toBe(retryAfterMs);
        }
      } finally {
        await harness.dispose(core);
      }
    })
  ),
];
