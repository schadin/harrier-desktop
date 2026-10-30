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
