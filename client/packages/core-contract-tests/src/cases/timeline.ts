import { expect } from 'vitest';
import { contractTest } from '../suite';

export const timelineCases = [
  contractTest('live messages are listed in order with sender and body', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'first' },
              { eventId: '$2', sender: '@bob:example.org', body: 'second' },
            ],
          },
        ],
      });
      const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
      expect(
        timeline.items.map((item) => [
          item.eventId,
          item.sender,
          item.kind === 'message' && item.content.body,
        ])
      ).toEqual([
        ['$1', '@alice:example.org', 'first'],
        ['$2', '@bob:example.org', 'second'],
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('an edit replaces the body and is not listed as its own item', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'typo' },
              { eventId: '$2', sender: '@alice:example.org', body: 'fixed', replaces: '$1' },
            ],
          },
        ],
      });
      const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
      expect(timeline.items.map((item) => item.eventId)).toEqual(['$1']);
      const [item] = timeline.items;
      expect(item?.kind === 'message' && item.content.body).toBe('fixed');
    } finally {
      await harness.dispose(core);
    }
  }),
];
