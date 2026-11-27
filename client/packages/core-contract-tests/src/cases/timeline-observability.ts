import { expect, vi } from 'vitest';
import { contractTest } from '../suite';

export const timelineObservabilityCases = [
  contractTest('source returns plain original and effective wire events', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            messages: [
              {
                eventId: '$source',
                sender: '@alice:example.org',
                body: 'source body',
                timestamp: 123,
                unsigned: { transaction_id: 'txn-source', age: 42 },
              },
            ],
          },
        ],
      });
      const result = await core.timeline.source('!room:example.org', '$source');
      expect(result.ok).toBe(true);
      if (!result.ok || !result.value) return;
      expect(result.value.edits).toEqual([]);
      expect(result.value.event.original).toEqual({
        event_id: '$source',
        room_id: '!room:example.org',
        sender: '@alice:example.org',
        type: 'm.room.message',
        origin_server_ts: 123,
        content: { msgtype: 'm.text', body: 'source body' },
        unsigned: { transaction_id: 'txn-source', age: 42 },
      });
      expect(result.value.event.effective).toEqual(result.value.event.original);
      expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
      const assertPlain = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        expect(Object.getPrototypeOf(value)).toBe(
          Array.isArray(value) ? Array.prototype : Object.prototype
        );
        Object.values(value).forEach(assertPlain);
      };
      assertPlain(result.value);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'source preserves encrypted originals, effective edits and relation order',
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
                  eventId: '$encrypted',
                  sender: '@alice:example.org',
                  body: 'ciphertext',
                  encrypted: true,
                  decryptedContent: { msgtype: 'm.text', body: 'clear body' },
                },
                {
                  eventId: '$edit-plain',
                  sender: '@alice:example.org',
                  body: 'plain edit',
                  replaces: '$encrypted',
                  timestamp: 200,
                },
                {
                  eventId: '$edit-encrypted',
                  sender: '@alice:example.org',
                  body: 'encrypted edit ciphertext',
                  encrypted: true,
                  replaces: '$encrypted',
                  timestamp: 300,
                  decryptedContent: {
                    msgtype: 'm.text',
                    body: 'clear edit',
                    'm.new_content': { msgtype: 'm.text', body: 'clear edit' },
                    'm.relates_to': { rel_type: 'm.replace', event_id: '$encrypted' },
                  },
                },
              ],
            },
          ],
        });
        const result = await core.timeline.source('!room:example.org', '$encrypted');
        expect(result.ok).toBe(true);
        if (!result.ok || !result.value) return;
        expect(result.value.event.original.type).toBe('m.room.encrypted');
        expect(result.value.event.original.content).toMatchObject({
          algorithm: 'm.megolm.v1.aes-sha2',
          ciphertext: 'ciphertext',
        });
        expect(result.value.event.effective).toMatchObject({
          event_id: '$encrypted',
          type: 'm.room.message',
          content: { msgtype: 'm.text', body: 'clear edit' },
        });
        expect(result.value.edits.map((edit) => edit.original.event_id)).toEqual([
          '$edit-plain',
          '$edit-encrypted',
        ]);
        expect(result.value.edits[1]?.original.type).toBe('m.room.encrypted');
        expect(result.value.edits[1]?.effective).toMatchObject({
          type: 'm.room.message',
          content: { body: 'clear edit' },
        });
        expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'source returns null for a missing event and fails for an unknown room',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'only' }],
            },
          ],
        });
        expect(await core.timeline.source('!room:example.org', '$missing')).toEqual({
          ok: true,
          value: null,
        });
        expect((await core.timeline.source('!missing:example.org', '$1')).ok).toBe(false);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'full timeline union keeps wire type, content, relation and redaction metadata',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$message', sender: '@alice:example.org', body: 'hello' },
                {
                  eventId: '$sticker',
                  sender: '@alice:example.org',
                  eventType: 'm.sticker',
                  body: 'sticker',
                  content: { body: 'sticker', url: 'mxc://example.org/sticker' },
                },
                {
                  eventId: '$encrypted',
                  sender: '@alice:example.org',
                  body: 'ciphertext',
                  encrypted: true,
                },
                {
                  eventId: '$redacted',
                  sender: '@alice:example.org',
                  body: 'removed',
                  redacted: true,
                  redactionReason: 'policy',
                  redactionEventId: '$redaction-id',
                },
                {
                  eventId: '$unsupported',
                  sender: '@alice:example.org',
                  eventType: 'org.example.custom',
                  body: '',
                  content: {
                    custom: true,
                    'm.relates_to': { rel_type: 'm.reference', event_id: '$message', key: 'ref' },
                  },
                },
              ],
              timelineStateEvents: [
                {
                  eventId: '$state',
                  sender: '@alice:example.org',
                  type: 'm.room.topic',
                  stateKey: '',
                  content: { topic: 'Topic' },
                  prevContent: { topic: 'Old topic' },
                },
              ],
            },
          ],
        });
        const { items } = core.timeline.timeline('!room:example.org').getSnapshot().value;
        expect(items.map((item) => item.kind)).toEqual([
          'message',
          'sticker',
          'encrypted',
          'redacted',
          'unsupported',
          'state',
        ]);
        expect(items.every((item) => typeof item.eventType === 'string')).toBe(true);
        expect(items[1]).toMatchObject({
          eventType: 'm.sticker',
          content: { body: 'sticker', url: 'mxc://example.org/sticker' },
        });
        expect(items[2]).toMatchObject({
          eventType: 'm.room.encrypted',
          content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'ciphertext' },
        });
        expect(items[3]).toMatchObject({
          eventType: 'm.room.message',
          redactionReason: 'policy',
          redactionEventId: '$redaction-id',
        });
        expect(items[3] && 'content' in items[3]).toBe(false);
        expect(items[4]).toMatchObject({
          eventType: 'org.example.custom',
          content: { custom: true },
          relation: { relType: 'm.reference', eventId: '$message', key: 'ref' },
        });
        expect(items[5]).toMatchObject({
          eventType: 'm.room.topic',
          stateKey: '',
          prevContent: { topic: 'Old topic' },
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'timeline, event and observeEvent share edits, reactions and readBy',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$1', sender: '@alice:example.org', body: 'before' },
                {
                  eventId: '$edit',
                  sender: '@alice:example.org',
                  body: 'after',
                  replaces: '$1',
                },
              ],
              reactions: [
                { eventId: '$reaction', target: '$1', sender: '@bob:example.org', key: '👍' },
              ],
              receipts: [{ eventId: '$1', userId: '@carol:example.org' }],
            },
          ],
        });
        const [timelineItem] = core.timeline.timeline('!room:example.org').getSnapshot()
          .value.items;
        const eventResult = await core.timeline.event('!room:example.org', '$1');
        expect(eventResult).toEqual({ ok: true, value: timelineItem });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        expect(store.getSnapshot().value).toBeUndefined();
        await vi.waitFor(() => expect(store.getSnapshot().value).toEqual(timelineItem));
        expect(store.getSnapshot().value).toMatchObject({
          edited: true,
          editEventId: '$edit',
          reactions: [
            {
              key: '👍',
              count: 1,
              senders: ['@bob:example.org'],
              events: [{ eventId: '$reaction', sender: '@bob:example.org', key: '👍' }],
            },
          ],
          readBy: ['@carol:example.org'],
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'observeEvent publishes valid newest edits and preserves unchanged item identity',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$1', sender: '@alice:example.org', body: 'original', timestamp: 100 },
                { eventId: '$other', sender: '@bob:example.org', body: 'other', timestamp: 101 },
              ],
            },
          ],
        });
        const timelineStore = core.timeline.timeline('!room:example.org');
        const eventStore = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(eventStore.getSnapshot().value?.kind).toBe('message'));
        const otherBefore = timelineStore.getSnapshot().value.items[1];
        const revisionBefore = eventStore.getSnapshot().revision;
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$invalid-sender',
                  sender: '@mallory:example.org',
                  body: 'forged',
                  replaces: '$1',
                  timestamp: 400,
                },
                {
                  eventId: '$malformed',
                  sender: '@alice:example.org',
                  body: '',
                  replaces: '$1',
                  timestamp: 500,
                  content: { 'm.new_content': { body: 42 } },
                },
                {
                  eventId: '$edit-old',
                  sender: '@alice:example.org',
                  body: 'older edit',
                  replaces: '$1',
                  timestamp: 200,
                },
                {
                  eventId: '$edit-new',
                  sender: '@alice:example.org',
                  body: 'newest edit',
                  replaces: '$1',
                  timestamp: 300,
                },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(eventStore.getSnapshot().value).toMatchObject({
            content: { body: 'newest edit', raw: { body: 'newest edit' } },
            edited: true,
            editEventId: '$edit-new',
          })
        );
        expect(eventStore.getSnapshot().revision).toBeGreaterThan(revisionBefore);
        expect(timelineStore.getSnapshot().value.items[1]).toBe(otherBefore);
        expect(timelineStore.getSnapshot().value.items[0]).toEqual(eventStore.getSnapshot().value);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('redacting the latest edit falls back to the previous edit', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            messages: [
              { eventId: '$1', sender: '@alice:example.org', body: 'original' },
              {
                eventId: '$edit-1',
                sender: '@alice:example.org',
                body: 'first edit',
                replaces: '$1',
                timestamp: 200,
              },
              {
                eventId: '$edit-2',
                sender: '@alice:example.org',
                body: 'second edit',
                replaces: '$1',
                timestamp: 300,
              },
            ],
          },
        ],
      });
      const store = core.timeline.observeEvent('!room:example.org', '$1');
      await vi.waitFor(() =>
        expect(store.getSnapshot().value).toMatchObject({
          content: { body: 'second edit' },
          editEventId: '$edit-2',
        })
      );
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            redactions: [{ eventId: '$edit-2', reason: 'edit removed' }],
          },
        ],
      });
      await vi.waitFor(() =>
        expect(store.getSnapshot().value).toMatchObject({
          content: { body: 'first edit' },
          editEventId: '$edit-1',
        })
      );
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            redactions: [{ eventId: '$edit-1', reason: 'edit removed' }],
          },
        ],
      });
      await vi.waitFor(() =>
        expect(store.getSnapshot().value).toMatchObject({ content: { body: 'original' } })
      );
      expect(store.getSnapshot().value).not.toHaveProperty('edited');
      expect(store.getSnapshot().value).not.toHaveProperty('editEventId');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'reaction observability keeps actual IDs, dedupes senders and follows redaction',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'react' }],
            },
          ],
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('message'));
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              reactions: [
                {
                  eventId: '$r1',
                  target: '$1',
                  sender: '@bob:example.org',
                  key: '👍',
                  shortcode: 'thumbsup',
                },
                { eventId: '$r2', target: '$1', sender: '@bob:example.org', key: '👍' },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            reactions: [
              {
                key: '👍',
                count: 1,
                senders: ['@bob:example.org'],
                shortcode: 'thumbsup',
                events: [
                  { eventId: '$r1', sender: '@bob:example.org', key: '👍' },
                  { eventId: '$r2', sender: '@bob:example.org', key: '👍' },
                ],
              },
            ],
          })
        );
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              redactions: [{ eventId: '$r1', reason: 'reaction removed' }],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            reactions: [
              {
                count: 1,
                events: [{ eventId: '$r2', sender: '@bob:example.org', key: '👍' }],
              },
            ],
          })
        );
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              redactions: [{ eventId: '$r2', reason: 'reaction removed' }],
            },
          ],
        });
        await vi.waitFor(() => expect(store.getSnapshot().value).not.toHaveProperty('reactions'));
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'reactions remain available on sticker, encrypted and redacted timeline bases',
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
                  eventId: '$sticker',
                  sender: '@alice:example.org',
                  eventType: 'm.sticker',
                  body: 'sticker',
                },
                {
                  eventId: '$encrypted',
                  sender: '@alice:example.org',
                  body: 'cipher',
                  encrypted: true,
                },
                {
                  eventId: '$redacted',
                  sender: '@alice:example.org',
                  body: 'gone',
                  redacted: true,
                },
              ],
              reactions: [
                { eventId: '$rs', target: '$sticker', sender: '@bob:example.org', key: 's' },
                { eventId: '$re', target: '$encrypted', sender: '@bob:example.org', key: 'e' },
                { eventId: '$rr', target: '$redacted', sender: '@bob:example.org', key: 'r' },
              ],
            },
          ],
        });
        const { items } = core.timeline.timeline('!room:example.org').getSnapshot().value;
        expect(items.map((item) => item.reactions?.[0]?.events[0]?.eventId)).toEqual([
          '$rs',
          '$re',
          '$rr',
        ]);
        expect(items.map((item) => item.kind)).toEqual(['sticker', 'encrypted', 'redacted']);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'reply and thread root survive an edit of the original wire event',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$root', sender: '@alice:example.org', body: 'root' },
                {
                  eventId: '$reply',
                  sender: '@bob:example.org',
                  body: 'reply',
                  threadRoot: '$root',
                },
                {
                  eventId: '$edit',
                  sender: '@bob:example.org',
                  body: 'edited reply',
                  replaces: '$reply',
                },
              ],
            },
          ],
        });
        const store = core.timeline.observeEvent('!room:example.org', '$reply');
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            content: { body: 'edited reply' },
            replyTo: '$root',
            threadRoot: '$root',
          })
        );
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'incremental receipts update readBy and exclude self and sender',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'hello' }],
            },
          ],
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('message'));
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              receipts: [
                { eventId: '$1', userId: '@tester:example.org' },
                { eventId: '$1', userId: '@alice:example.org' },
                { eventId: '$1', userId: '@bob:example.org' },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({ readBy: ['@bob:example.org'] })
        );
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'late decryption publishes a message while preserving the encrypted wire type',
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
                  body: 'ciphertext',
                  encrypted: true,
                },
              ],
            },
          ],
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('encrypted'));
        const timelineStore = core.timeline.timeline('!room:example.org');
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$1',
                  sender: '@alice:example.org',
                  body: 'ciphertext',
                  encrypted: true,
                  decryptedContent: { msgtype: 'm.text', body: 'late plaintext' },
                },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            kind: 'message',
            eventType: 'm.room.encrypted',
            content: { body: 'late plaintext' },
          })
        );
        expect(timelineStore.getSnapshot().value.items[0]).toEqual(store.getSnapshot().value);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'late decryption failure publishes an exact observable failure code',
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
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('encrypted'));
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
                  failureCode: 'OLM_UNKNOWN_MESSAGE_INDEX',
                },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            kind: 'encrypted',
            failure: 'unknown',
            failureCode: 'OLM_UNKNOWN_MESSAGE_INDEX',
            content: { msgtype: 'm.bad.encrypted' },
          })
        );
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'late decryption can publish a sticker with its encrypted wire type',
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
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('encrypted'));
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
                  decryptedType: 'm.sticker',
                  decryptedContent: { body: 'decrypted sticker', url: 'mxc://example.org/sticker' },
                },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            kind: 'sticker',
            eventType: 'm.room.encrypted',
            content: { body: 'decrypted sticker', url: 'mxc://example.org/sticker' },
          })
        );
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'decryption failure stays encrypted with an exact code and bad-encrypted content',
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
                  body: 'ciphertext',
                  encrypted: true,
                  failureCode: 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE',
                },
              ],
            },
          ],
        });
        const store = core.timeline.observeEvent('!room:example.org', '$1');
        await vi.waitFor(() =>
          expect(store.getSnapshot().value).toMatchObject({
            kind: 'encrypted',
            eventType: 'm.room.encrypted',
            failure: 'unknown',
            failureCode: 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE',
            content: { msgtype: 'm.bad.encrypted' },
          })
        );
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'target redaction republishes message, sticker and encrypted items without body',
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
                  eventId: '$message',
                  sender: '@alice:example.org',
                  body: 'secret',
                },
                {
                  eventId: '$sticker',
                  sender: '@alice:example.org',
                  eventType: 'm.sticker',
                  body: 'sticker secret',
                },
                {
                  eventId: '$encrypted',
                  sender: '@alice:example.org',
                  body: 'cipher',
                  encrypted: true,
                  decryptedContent: { msgtype: 'm.text', body: 'encrypted secret' },
                },
              ],
            },
          ],
        });
        const stores = ['$message', '$sticker', '$encrypted'].map((eventId) =>
          core.timeline.observeEvent('!room:example.org', eventId)
        );
        await vi.waitFor(() =>
          expect(stores.every((store) => store.getSnapshot().value !== undefined)).toBe(true)
        );
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              redactions: [
                {
                  eventId: '$message',
                  reason: 'message policy',
                  redactionEventId: '$redact-message',
                },
                {
                  eventId: '$sticker',
                  reason: 'sticker policy',
                  redactionEventId: '$redact-sticker',
                },
                {
                  eventId: '$encrypted',
                  reason: 'encrypted policy',
                  redactionEventId: '$redact-encrypted',
                },
              ],
            },
          ],
        });
        await vi.waitFor(() =>
          expect(stores.map((store) => store.getSnapshot().value?.kind)).toEqual([
            'redacted',
            'redacted',
            'redacted',
          ])
        );
        expect(stores.map((store) => store.getSnapshot().value)).toMatchObject([
          {
            eventType: 'm.room.message',
            redactionReason: 'message policy',
            redactionEventId: '$redact-message',
          },
          {
            eventType: 'm.sticker',
            redactionReason: 'sticker policy',
            redactionEventId: '$redact-sticker',
          },
          {
            eventType: 'm.room.encrypted',
            redactionReason: 'encrypted policy',
            redactionEventId: '$redact-encrypted',
          },
        ]);
        stores.forEach((store) => expect(store.getSnapshot().value).not.toHaveProperty('content'));
        const source = await core.timeline.source('!room:example.org', '$message');
        expect(source.ok && source.value?.event.original.unsigned?.redacted_because).toMatchObject({
          event_id: '$redact-message',
          content: { reason: 'message policy' },
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'unreadStartIndex uses raw reaction receipt targets before filtering',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!room:example.org',
              membership: 'join',
              messages: [
                { eventId: '$old', sender: '@alice:example.org', body: 'old' },
                { eventId: '$new', sender: '@alice:example.org', body: 'new' },
              ],
              eventOrder: ['$old', '$reaction', '$new'],
              reactions: [
                { eventId: '$reaction', target: '$old', sender: '@bob:example.org', key: '👍' },
              ],
              receipts: [{ eventId: '$reaction', userId: '@tester:example.org' }],
            },
          ],
        });
        const timeline = core.timeline.timeline('!room:example.org').getSnapshot().value;
        expect(timeline.items.map((item) => item.eventId)).toEqual(['$old', '$new']);
        expect(timeline.readUpTo).toBe('$reaction');
        expect(timeline.unreadStartIndex).toBe(1);
      } finally {
        await harness.dispose(core);
      }
    }
  ),
];
