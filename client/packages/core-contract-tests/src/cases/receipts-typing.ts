import { expect } from 'vitest';
import { contractTest } from '../suite';

export const receiptsTypingCases = [
  contractTest('markRead advances the read up to marker', async (harness) => {
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
          },
        ],
      });
      const result = await core.timeline.markRead('!room:example.org', '$2');
      expect(result.ok).toBe(true);
      const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
      expect(timeline.readUpTo).toBe('$2');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('markRead with a private receipt also advances the marker', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'first' }],
          },
        ],
      });
      const result = await core.timeline.markRead('!room:example.org', '$1', true);
      expect(result.ok).toBe(true);
      const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
      expect(timeline.readUpTo).toBe('$1');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('markRead fails for an unknown event and an unknown room', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'first' }],
          },
        ],
      });
      const unknownEvent = await core.timeline.markRead('!room:example.org', '$unknown');
      expect(unknownEvent.ok).toBe(false);
      if (!unknownEvent.ok) expect(unknownEvent.error.code).toBe('not-found');
      const unknownRoom = await core.timeline.markRead('!missing:example.org', '$1');
      expect(unknownRoom.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('setTyping succeeds and fails for an unknown room', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room' }],
      });
      const typing = await core.presence.setTyping('!room:example.org', true, 30000);
      expect(typing.ok).toBe(true);
      const stopped = await core.presence.setTyping('!room:example.org', false);
      expect(stopped.ok).toBe(true);
      const unknown = await core.presence.setTyping('!missing:example.org', true);
      expect(unknown.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),
];
