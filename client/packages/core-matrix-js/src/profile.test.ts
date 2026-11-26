import { UserEvent } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver, TEST_USER_ID, type FakeTransportCall } from './testing/driver';

const DISPLAY_NAME_PATH = '/profile/%40tester%3Aexample.org/displayname';
const AVATAR_URL_PATH = '/profile/%40tester%3Aexample.org/avatar_url';

const profileCalls = (calls: readonly FakeTransportCall[]) =>
  calls.filter(({ path }) => path.startsWith('/profile/'));

describe('matrix-js own profile', () => {
  it('sends an exact display name once and updates the snapshot through one synthetic event', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const profile = core.presence.profile(TEST_USER_ID);
    const onDisplayName = vi.fn();
    driver.client.on(UserEvent.DisplayName, onDisplayName);
    try {
      const result = await core.presence.setOwnProfile({ displayName: '  Alice  ' });

      expect(result).toEqual({ ok: true, value: undefined });
      expect(profileCalls(driver.getCalls())).toEqual([
        { method: 'PUT', path: DISPLAY_NAME_PATH, body: { displayname: '  Alice  ' } },
      ]);
      expect(onDisplayName).toHaveBeenCalledTimes(1);
      expect(profile.getSnapshot().value).toEqual({
        userId: TEST_USER_ID,
        displayName: '  Alice  ',
      });
    } finally {
      await core.auth.stop();
    }
  });

  it.each([
    ['mxc://example.org/avatar', 'mxc://example.org/avatar'],
    [null, ''],
  ] as const)('maps avatar input %s to the SDK avatar_url body', async (avatarUrl, expected) => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    try {
      const result = await core.presence.setOwnProfile({ avatarUrl });

      expect(result).toEqual({ ok: true, value: undefined });
      expect(profileCalls(driver.getCalls())).toEqual([
        { method: 'PUT', path: AVATAR_URL_PATH, body: { avatar_url: expected } },
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('rejects an empty update without HTTP or synthetic profile events', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const onDisplayName = vi.fn();
    const onAvatarUrl = vi.fn();
    driver.client.on(UserEvent.DisplayName, onDisplayName);
    driver.client.on(UserEvent.AvatarUrl, onAvatarUrl);
    try {
      const result = await core.presence.setOwnProfile({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ code: 'invalid-request', retryable: false });
      }
      expect(profileCalls(driver.getCalls())).toEqual([]);
      expect(onDisplayName).not.toHaveBeenCalled();
      expect(onAvatarUrl).not.toHaveBeenCalled();
    } finally {
      await core.auth.stop();
    }
  });

  it('logs display-name then avatar attempts and keeps the first update on partial failure', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const profile = core.presence.profile(TEST_USER_ID);
    driver.failNextOperation('/avatar_url', {
      httpStatus: 403,
      errcode: 'M_FORBIDDEN',
      error: 'Forbidden',
    });
    try {
      const result = await core.presence.setOwnProfile({
        displayName: 'Alice',
        avatarUrl: 'mxc://example.org/new-avatar',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: 'forbidden',
          retryable: false,
          httpStatus: 403,
          errcode: 'M_FORBIDDEN',
        });
      }
      expect(profileCalls(driver.getCalls())).toEqual([
        { method: 'PUT', path: DISPLAY_NAME_PATH, body: { displayname: 'Alice' } },
        {
          method: 'PUT',
          path: AVATAR_URL_PATH,
          body: { avatar_url: 'mxc://example.org/new-avatar' },
        },
      ]);
      expect(profile.getSnapshot().value).toEqual({ userId: TEST_USER_ID, displayName: 'Alice' });
    } finally {
      await core.auth.stop();
    }
  });
});

describe('matrix-js 3PIDs', () => {
  it('reads the homeserver account endpoint exactly once per query', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    try {
      await driver.applyFixture({
        rooms: [],
        threepids: [{ medium: 'email', address: 'alice@example.org' }],
      });

      const result = await core.auth.threePids();

      expect(result).toEqual({
        ok: true,
        value: [{ medium: 'email', address: 'alice@example.org' }],
      });
      expect(driver.getCalls().filter(({ path }) => path === '/account/3pid')).toEqual([
        { method: 'GET', path: '/account/3pid' },
      ]);
    } finally {
      await core.auth.stop();
    }
  });
});
