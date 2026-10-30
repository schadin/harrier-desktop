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

  contractTest('remote read receipts list the readers of the event', async (harness) => {
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
              { eventId: '$2', sender: '@alice:example.org', body: 'second' },
            ],
            receipts: [{ eventId: '$1', userId: '@bob:example.org' }],
          },
        ],
      });
      const [first, second] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(first?.kind === 'message' && first.readBy).toEqual(['@bob:example.org']);
      expect(second?.kind === 'message' && second.readBy).toBeUndefined();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'timeline reports backward history when a pagination token is known',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              name: 'Room',
              messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'recent' }],
              backwardToken: 't1',
            },
          ],
        });
        expect(
          core.timeline.timeline('!room:example.org').getSnapshot().value.hasBackwardHistory
        ).toBe(true);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('timeline reports no backward history for a fully loaded room', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'only' }],
          },
        ],
      });
      expect(
        core.timeline.timeline('!room:example.org').getSnapshot().value.hasBackwardHistory
      ).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('own read receipt is exposed as the room read position', async (harness) => {
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
              { eventId: '$2', sender: '@alice:example.org', body: 'second' },
            ],
            receipts: [{ eventId: '$1', userId: '@tester:example.org' }],
          },
        ],
      });
      expect(core.timeline.timeline('!room:example.org').getSnapshot().value.readUpTo).toBe('$1');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('sending and failed messages keep their send status', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@tester:example.org', body: 'pending', status: 'sending' },
              { eventId: '$2', sender: '@tester:example.org', body: 'broken', status: 'failed' },
            ],
          },
        ],
      });
      const { items } = core.timeline.timeline('!room:example.org').getSnapshot().value;
      expect(items.map((item) => (item.kind === 'message' ? item.status : null))).toEqual([
        'sending',
        'failed',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('encrypted messages expose decryption failure and preview', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              {
                eventId: '$1',
                sender: '@alice:example.org',
                body: 'ciphertext',
                encrypted: true,
                failure: 'missing-keys',
              },
            ],
          },
        ],
      });
      const [item] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(item?.kind).toBe('encrypted');
      expect(item?.kind === 'encrypted' && item.failure).toBe('missing-keys');
      expect(item?.preview).toBe('Unable to decrypt message');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('text preview is normalized and redaction has its own preview', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'hello   world\nagain' },
              { eventId: '$2', sender: '@alice:example.org', body: 'secret', redacted: true },
            ],
          },
        ],
      });
      const [text, redacted] = core.timeline.timeline('!room:example.org').getSnapshot()
        .value.items;
      expect(text?.preview).toBe('hello world again');
      expect(redacted?.preview).toBe('Message deleted');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('thread replies keep the root event id', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [
              { eventId: '$root', sender: '@alice:example.org', body: 'root' },
              {
                eventId: '$reply',
                sender: '@bob:example.org',
                body: 'reply',
                threadRoot: '$root',
              },
            ],
          },
        ],
      });
      const [, reply] = core.timeline.timeline('!room:example.org').getSnapshot().value.items;
      expect(reply?.kind === 'message' && reply.threadRoot).toBe('$root');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'paginateBackward prepends history and clears the token at the end',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              name: 'Room',
              backwardToken: 't1',
              messages: [{ eventId: '$recent', sender: '@alice:example.org', body: 'recent' }],
              history: {
                messages: [{ eventId: '$older', sender: '@alice:example.org', body: 'older' }],
              },
            },
          ],
        });
        const result = await core.timeline.paginateBackward('!room:example.org', 10);
        expect(result.ok).toBe(true);
        const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
        expect(timeline.items.map((item) => item.eventId)).toEqual(['$older', '$recent']);
        expect(timeline.hasBackwardHistory).toBe(false);
      } finally {
        await harness.dispose(core);
      }
    }
  ),
];
