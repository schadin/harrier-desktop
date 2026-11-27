import { expect, vi } from 'vitest';
import { contractTest } from '../suite';

export const notificationContractCases = [
  contractTest('inbox maps full plain events and forwards pagination filters', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [],
        notifications: [
          {
            roomId: '!room:example.org',
            event: {
              eventId: '$notification',
              sender: '@alice:example.org',
              type: 'm.room.message',
              content: { msgtype: 'm.text', body: 'server body' },
              unsigned: { age: 12, transaction_id: 'txn' },
              timestamp: 100,
            },
            timestamp: 200,
            read: true,
          },
        ],
      });
      const result = await core.notifications.list('from-token', 7, true);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.items[0]).toEqual({
        id: '$notification',
        roomId: '!room:example.org',
        eventId: '$notification',
        senderId: '@alice:example.org',
        type: 'm.room.message',
        content: { msgtype: 'm.text', body: 'server body' },
        event: {
          event_id: '$notification',
          room_id: '!room:example.org',
          sender: '@alice:example.org',
          type: 'm.room.message',
          content: { msgtype: 'm.text', body: 'server body' },
          origin_server_ts: 100,
          unsigned: { age: 12, transaction_id: 'txn' },
        },
        timelineItem: null,
        timestamp: 200,
        read: true,
      });
      expect(harness.getCalls()).toContainEqual({
        method: 'GET',
        path: '/notifications',
        query: { from: 'from-token', limit: 7, only: 'highlight' },
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'local redaction wins over a stale unredacted notification event',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'local body' }],
            },
          ],
          notifications: [
            {
              roomId: '!room:example.org',
              event: {
                eventId: '$1',
                sender: '@alice:example.org',
                type: 'm.room.message',
                content: { msgtype: 'm.text', body: 'stale body' },
              },
            },
          ],
        });
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              redactions: [{ eventId: '$1', reason: 'local policy', redactionEventId: '$redact' }],
            },
          ],
        });
        const result = await core.notifications.list();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.items[0]?.event.content).toEqual({});
        expect(result.value.items[0]?.event.unsigned?.redacted_because).toMatchObject({
          event_id: '$redact',
          content: { reason: 'local policy' },
        });
        expect(result.value.items[0]?.timelineItem).toMatchObject({
          kind: 'redacted',
          redactionReason: 'local policy',
          redactionEventId: '$redact',
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'encrypted notification keeps raw wire event and exposes a decrypted edit',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$1',
                  sender: '@alice:example.org',
                  body: 'cipher',
                  encrypted: true,
                  decryptedContent: { msgtype: 'm.text', body: 'clear original' },
                },
                {
                  eventId: '$edit',
                  sender: '@alice:example.org',
                  body: 'edited clear',
                  formattedBody: '<b>edited clear</b>',
                  replaces: '$1',
                },
              ],
            },
          ],
          notifications: [
            {
              roomId: '!room:example.org',
              event: {
                eventId: '$1',
                sender: '@alice:example.org',
                type: 'm.room.encrypted',
                content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'stale-cipher' },
              },
            },
          ],
        });
        const result = await core.notifications.list();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.items[0]?.event).toMatchObject({
          type: 'm.room.encrypted',
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'cipher' },
        });
        expect(result.value.items[0]?.timelineItem).toMatchObject({
          kind: 'message',
          eventType: 'm.room.encrypted',
          edited: true,
          editEventId: '$edit',
          content: {
            body: 'edited clear',
            formattedBody: '<b>edited clear</b>',
            format: 'org.matrix.custom.html',
          },
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'encrypted notification failure preserves exact failure without invented plaintext',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$1',
                  sender: '@alice:example.org',
                  body: 'cipher',
                  encrypted: true,
                  failureCode: 'UNKNOWN_SENDER_DEVICE',
                },
              ],
            },
          ],
          notifications: [
            {
              roomId: '!room:example.org',
              event: {
                eventId: '$1',
                sender: '@alice:example.org',
                type: 'm.room.encrypted',
                content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'cipher' },
              },
            },
          ],
        });
        const result = await core.notifications.list();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.items[0]?.timelineItem).toMatchObject({
          kind: 'encrypted',
          failure: 'unknown-device',
          failureCode: 'UNKNOWN_SENDER_DEVICE',
          content: { msgtype: 'm.bad.encrypted' },
        });
        expect(
          result.value.items[0]?.timelineItem?.kind === 'encrypted' &&
            result.value.items[0].timelineItem.content.body
        ).toContain('Unable to decrypt');
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('missing local notification event never fetches context', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [],
        notifications: [
          {
            roomId: '!room:example.org',
            event: {
              eventId: '$remote-only',
              sender: '@alice:example.org',
              type: 'm.room.message',
              content: { msgtype: 'm.text', body: 'remote only' },
              unsigned: { age: 5 },
            },
          },
        ],
      });
      const result = await core.notifications.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.items[0]?.timelineItem).toBeNull();
      expect(result.value.items[0]?.event).toMatchObject({
        event_id: '$remote-only',
        content: { body: 'remote only' },
        unsigned: { age: 5 },
      });
      expect(harness.getCalls().some((call) => call.path.includes('/context/'))).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('unsupported notification content and relation stay plain', async (harness) => {
    const core = await harness.create();
    try {
      const content = {
        custom: 'value',
        'm.relates_to': { rel_type: 'm.reference', event_id: '$target', key: 'key' },
      };
      await harness.applySyncFixture({
        rooms: [],
        notifications: [
          {
            roomId: '!room:example.org',
            event: {
              eventId: '$custom',
              sender: '@alice:example.org',
              type: 'org.example.custom',
              content,
            },
          },
        ],
      });
      const result = await core.notifications.list();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.items[0]).toMatchObject({
        type: 'org.example.custom',
        content,
        event: { type: 'org.example.custom', content },
        timelineItem: null,
      });
      expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
      const assertNoFunctions = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
          expect(typeof value).not.toBe('function');
          return;
        }
        Object.values(value).forEach(assertNoFunctions);
      };
      assertNoFunctions(result.value);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'notification list reflects late decryption on a subsequent local enrichment',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$1', sender: '@alice:example.org', body: 'cipher', encrypted: true },
              ],
            },
          ],
          notifications: [
            {
              roomId: '!room:example.org',
              event: {
                eventId: '$1',
                sender: '@alice:example.org',
                type: 'm.room.encrypted',
                content: { ciphertext: 'cipher' },
              },
            },
          ],
        });
        const before = await core.notifications.list();
        expect(before.ok && before.value.items[0]?.timelineItem?.kind).toBe('encrypted');
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$1',
                  sender: '@alice:example.org',
                  body: 'cipher',
                  encrypted: true,
                  decryptedContent: { msgtype: 'm.text', body: 'now clear' },
                },
              ],
            },
          ],
        });
        await vi.waitFor(async () => {
          const after = await core.notifications.list();
          expect(after.ok && after.value.items[0]?.timelineItem).toMatchObject({
            kind: 'message',
            content: { body: 'now clear' },
          });
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),
];
