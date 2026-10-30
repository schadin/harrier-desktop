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

  contractTest('a redacted message is listed as redacted without its body', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'secret', redacted: true },
            ],
          },
        ],
      });
      const [item] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(item?.kind).toBe('redacted');
      expect(item && 'content' in item).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('a reply keeps the id of the event it answers', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'question' },
              { eventId: '$2', sender: '@bob:example.org', body: 'answer', replyTo: '$1' },
            ],
          },
        ],
      });
      const [, reply] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(reply?.kind === 'message' && reply.replyTo).toBe('$1');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('reactions are counted per key on the reacted message', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'hi' }],
            reactions: [
              { eventId: '$r1', target: '$1', sender: '@bob:example.org', key: '👍' },
              { eventId: '$r2', target: '$1', sender: '@carol:example.org', key: '👍' },
              { eventId: '$r3', target: '$1', sender: '@bob:example.org', key: '🎉' },
            ],
          },
        ],
      });
      const [item] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(item?.kind === 'message' && item.reactions).toEqual([
        { key: '👍', count: 2 },
        { key: '🎉', count: 1 },
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),
];
