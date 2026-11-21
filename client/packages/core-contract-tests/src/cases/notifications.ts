import { expect } from 'vitest';
import { contractTest } from '../suite';

export const notificationCases = [
  contractTest(
    'notification preferences and room mode are available through core',
    async (harness) => {
      const core = await harness.create();
      try {
        expect(core.notifications.preferences.getSnapshot().value).toEqual({
          mute: [],
          specialMessages: [],
          allMessages: [],
        });
        const result = await core.notifications.setRoomMode('!room:example.org', 'mute', 'unset');
        expect(result.ok).toBe(true);
        const refreshed = await core.notifications.refreshPreferences();
        expect(refreshed.ok).toBe(true);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('unread counts are exposed on room summaries', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            unread: { total: 3, highlight: 1 },
          },
        ],
      });
      expect(core.rooms.list.getSnapshot().value[0]?.unread).toEqual({ total: 3, highlight: 1 });
      expect(core.rooms.unreads.getSnapshot().value).toEqual([
        { roomId: '!room:example.org', unread: { total: 3, highlight: 1 } },
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('notification mode follows the room push rule', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!muted:example.org',
            membership: 'join',
            name: 'Muted',
            notificationMode: 'mute',
          },
          {
            roomId: '!mentions:example.org',
            membership: 'join',
            name: 'Mentions',
            notificationMode: 'mentions',
          },
        ],
      });
      const modes = core.rooms.list.getSnapshot().value.map((room) => room.notificationMode);
      expect(modes).toEqual(['mute', 'mentions']);
    } finally {
      await harness.dispose(core);
    }
  }),
];
