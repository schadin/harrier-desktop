import { expect } from 'vitest';
import { contractTest } from '../suite';

export const presenceCases = [
  contractTest('presence events are exposed per user', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [],
        presence: [
          { userId: '@alice:example.org', status: 'online' },
          { userId: '@bob:example.org', status: 'unavailable' },
        ],
      });
      expect(core.presence.presence('@alice:example.org').getSnapshot().value?.status).toBe(
        'online'
      );
      expect(core.presence.presence('@bob:example.org').getSnapshot().value?.status).toBe(
        'unavailable'
      );
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'presence exposes status message, activity and last active timestamp',
    async (harness) => {
      const core = await harness.create();
      try {
        const lastActiveTs = Date.now() - 60_000;
        await harness.applySyncFixture({
          rooms: [],
          presence: [
            {
              userId: '@alice:example.org',
              status: 'online',
              statusMessage: 'In a meeting',
              active: true,
              lastActiveTs,
            },
          ],
        });
        expect(core.presence.presence('@alice:example.org').getSnapshot().value).toMatchObject({
          userId: '@alice:example.org',
          status: 'online',
          statusMessage: 'In a meeting',
          active: true,
        });
        const view = core.presence.presence('@alice:example.org').getSnapshot().value;
        expect(view?.lastActiveTs).toBeGreaterThanOrEqual(lastActiveTs - 1000);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('own presence can be set through the contract', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.presence.setOwnPresence({
        status: 'online',
        statusMessage: 'Working',
      });
      expect(result.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('own presence can be read through the contract', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.presence.getOwnPresence();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value?.userId).toBeTypeOf('string');
        expect(result.value?.status).toBe('offline');
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'own profile display name preserves exact input and updates the snapshot',
    async (harness) => {
      const core = await harness.create();
      try {
        const profile = core.presence.profile('@tester:example.org');
        expect(profile.getSnapshot().value).toEqual({ userId: '@tester:example.org' });

        const result = await core.presence.setOwnProfile({ displayName: '  Alice  ' });

        expect(result).toEqual({ ok: true, value: undefined });
        expect(profile.getSnapshot().value).toEqual({
          userId: '@tester:example.org',
          displayName: '  Alice  ',
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('own profile avatar accepts MXC URLs and removes null avatars', async (harness) => {
    const core = await harness.create();
    try {
      const profile = core.presence.profile('@tester:example.org');
      const avatarUrl = 'mxc://example.org/avatar';

      const uploaded = await core.presence.setOwnProfile({ avatarUrl });
      expect(uploaded).toEqual({ ok: true, value: undefined });
      expect(profile.getSnapshot().value).toEqual({
        userId: '@tester:example.org',
        avatarUrl,
      });

      const removed = await core.presence.setOwnProfile({ avatarUrl: null });
      expect(removed).toEqual({ ok: true, value: undefined });
      expect(profile.getSnapshot().value).toEqual({ userId: '@tester:example.org' });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('own profile rejects an empty update as invalid-request', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.presence.setOwnProfile({});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({ code: 'invalid-request', retryable: false });
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'own profile partial failure keeps the successful display name update',
    async (harness) => {
      const core = await harness.create();
      try {
        const profile = core.presence.profile('@tester:example.org');
        const initial = await core.presence.setOwnProfile({
          avatarUrl: 'mxc://example.org/old-avatar',
        });
        expect(initial.ok).toBe(true);
        harness.failNextOperation('/avatar_url', {
          operation: '/avatar_url',
          httpStatus: 403,
          errcode: 'M_FORBIDDEN',
          error: 'Forbidden',
        });

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
        expect(profile.getSnapshot().value).toEqual({
          userId: '@tester:example.org',
          displayName: 'Alice',
          avatarUrl: 'mxc://example.org/old-avatar',
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('typing members are listed for the room', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            typing: ['@alice:example.org', '@bob:example.org'],
          },
        ],
      });
      expect(core.presence.typing('!room:example.org').getSnapshot().value).toEqual([
        '@alice:example.org',
        '@bob:example.org',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),
];
