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
];
