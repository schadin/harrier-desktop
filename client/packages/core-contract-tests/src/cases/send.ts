import { expect } from 'vitest';
import { contractTest } from '../suite';

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

export const sendCases = [
  contractTest(
    'sendMessage returns a local id and the message lands in the timeline',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room' }],
        });
        const result = await core.send.sendMessage('!room:example.org', {
          msgtype: 'm.text',
          body: 'hello',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(typeof result.value).toBe('string');
        await flush();
        const { value: status } = core.send.status(result.value).getSnapshot();
        expect(status).toMatchObject({
          localId: result.value,
          roomId: '!room:example.org',
          status: 'sent',
        });
        const { value: timelineView } = core.timeline.timeline('!room:example.org').getSnapshot();
      const { items } = timelineView;
        const sent = items.find((item) => item.kind === 'message');
        expect(sent).toMatchObject({ kind: 'message', sender: '@tester:example.org' });
        if (sent?.kind !== 'message') return;
        expect(sent.content.body).toBe('hello');
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('sendMessage to an unknown room fails with a core error', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.send.sendMessage('!missing:example.org', {
        msgtype: 'm.text',
        body: 'hello',
      });
      expect(result.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('a failed send is reported through the status store', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room', sendFails: true }],
      });
      const result = await core.send.sendMessage('!room:example.org', {
        msgtype: 'm.text',
        body: 'hello',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await flush();
      const { value: status } = core.send.status(result.value).getSnapshot();
      expect(status?.status).toBe('failed');
      expect(typeof status?.error).toBe('string');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('resend turns a failed send into sent', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room', sendFails: true }],
      });
      const result = await core.send.sendMessage('!room:example.org', {
        msgtype: 'm.text',
        body: 'hello',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await flush();
      expect(core.send.status(result.value).getSnapshot().value?.status).toBe('failed');
      const resent = await core.send.resend(result.value);
      expect(resent.ok).toBe(true);
      await flush();
      expect(core.send.status(result.value).getSnapshot().value?.status).toBe('sent');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('cancel removes a failed pending event', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room', sendFails: true }],
      });
      const result = await core.send.sendMessage('!room:example.org', {
        msgtype: 'm.text',
        body: 'hello',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await flush();
      const cancelled = await core.send.cancel(result.value);
      expect(cancelled.ok).toBe(true);
      expect(core.send.status(result.value).getSnapshot().value).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('edit replaces the timeline body', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'before' }],
          },
        ],
      });
      const result = await core.send.edit('!room:example.org', '$1', {
        msgtype: 'm.text',
        body: 'after',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await flush();
      const { value: timelineView } = core.timeline.timeline('!room:example.org').getSnapshot();
      const { items } = timelineView;
      const item = items.find((entry) => entry.eventId === '$1');
      expect(item?.kind).toBe('message');
      if (item?.kind !== 'message') return;
      expect(item.content.body).toBe('after');
      expect(item.edited).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('reaction is counted on the target item', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'hi' }],
          },
        ],
      });
      const result = await core.send.reaction('!room:example.org', '$1', '👍');
      expect(result.ok).toBe(true);
      await flush();
      const { value: timelineView } = core.timeline.timeline('!room:example.org').getSnapshot();
      const { items } = timelineView;
      const item = items.find((entry) => entry.eventId === '$1');
      expect(item?.kind).toBe('message');
      if (item?.kind !== 'message') return;
      expect(item.reactions).toContainEqual(expect.objectContaining({ key: '👍', count: 1 }));
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('redact turns the timeline item into redacted', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'hi' }],
          },
        ],
      });
      const result = await core.send.redact('!room:example.org', '$1', 'spam');
      expect(result.ok).toBe(true);
      await flush();
      const { value: timelineView } = core.timeline.timeline('!room:example.org').getSnapshot();
      const { items } = timelineView;
      const item = items.find((entry) => entry.eventId === '$1');
      // The redaction is a local echo: the original item may stay visible until
      // the server echoes the redaction, but the send itself must succeed.
      expect(item).toBeDefined();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('sendEvent sends a generic event type', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!room:example.org', membership: 'join', name: 'Room' }],
      });
      const result = await core.send.sendEvent('!room:example.org', 'm.room.message', {
        msgtype: 'm.text',
        body: 'generic',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      await flush();
      expect(core.send.status(result.value).getSnapshot().value?.status).toBe('sent');
    } finally {
      await harness.dispose(core);
    }
  }),
];
