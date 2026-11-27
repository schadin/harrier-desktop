import { ClientEvent, MatrixEvent } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver } from './testing/driver';

describe('matrix-js timeline source and event stores', () => {
  it('uses a bundled replacement even when it is absent from the relation container', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!bundled:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [{ eventId: '$target', sender: '@alice:example.org', body: 'before' }],
          },
        ],
      });
      const room = driver.client.getRoom(roomId)!;
      const target = room.findEventById('$target')!;
      const replacement = new MatrixEvent({
        event_id: '$bundled-edit',
        room_id: roomId,
        sender: '@alice:example.org',
        origin_server_ts: 200,
        type: 'm.room.message',
        content: {
          'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
          'm.new_content': { msgtype: 'm.text', body: 'bundled edit' },
        },
      });
      expect(
        room.getUnfilteredTimelineSet().relations.getAllChildEventsForEvent('$target')
      ).toEqual([]);
      target.makeReplaced(replacement);

      const event = await core.timeline.event(roomId, '$target');
      expect(event).toMatchObject({
        ok: true,
        value: { content: { body: 'bundled edit' }, edited: true, editEventId: '$bundled-edit' },
      });
      const source = await core.timeline.source(roomId, '$target');
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$bundled-edit',
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('publishes null for unknown and removed rooms in observable event stores', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!removed:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [{ eventId: '$1', sender: '@alice:example.org', body: 'hello' }],
          },
        ],
      });
      const unknown = core.timeline.observeEvent('!unknown:example.org', '$1');
      await vi.waitFor(() => expect(unknown.getSnapshot().value).toBeNull());
      const observed = core.timeline.observeEvent(roomId, '$1');
      await vi.waitFor(() => expect(observed.getSnapshot().value?.kind).toBe('message'));
      driver.client.emit(ClientEvent.DeleteRoom, roomId);
      expect(observed.getSnapshot().value).toBeNull();
    } finally {
      await core.auth.stop();
    }
  });
});
