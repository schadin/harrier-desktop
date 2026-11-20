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
