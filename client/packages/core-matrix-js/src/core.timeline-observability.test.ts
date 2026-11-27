import { ClientEvent, MatrixEvent } from 'matrix-js-sdk';
import { RelationsContainer } from 'matrix-js-sdk/lib/models/relations-container';
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
      expect(source.ok && source.value?.event.effective.content).toMatchObject({
        body: 'bundled edit',
      });
    } finally {
      await core.auth.stop();
    }
  });

  it('ignores an invalid SDK replacement in timeline, event and source mappings', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!invalid-replacement:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [{ eventId: '$target', sender: '@alice:example.org', body: 'original' }],
          },
        ],
      });
      const target = driver.client.getRoom(roomId)!.findEventById('$target')!;
      target.makeReplaced(
        new MatrixEvent({
          event_id: '$malformed',
          room_id: roomId,
          sender: '@alice:example.org',
          origin_server_ts: 200,
          type: 'm.room.message',
          content: {
            'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
            'm.new_content': { body: 42 },
          },
        })
      );
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({
        content: { body: 'original', raw: { body: 'original' } },
      });
      expect(timelineItem).not.toHaveProperty('edited');
      expect(event).toMatchObject({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toMatchObject({
        body: 'original',
      });
      expect(source.ok && source.value?.edits).toEqual([]);
    } finally {
      await core.auth.stop();
    }
  });

  it('ignores a bundled replacement whose relation targets another event', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!wrong-bundled-target:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [
              { eventId: '$target', sender: '@alice:example.org', body: 'target original' },
              { eventId: '$other', sender: '@alice:example.org', body: 'other original' },
            ],
          },
        ],
      });
      const target = driver.client.getRoom(roomId)!.findEventById('$target')!;
      target.makeReplaced(
        new MatrixEvent({
          event_id: '$wrong-target',
          room_id: roomId,
          sender: '@alice:example.org',
          origin_server_ts: 300,
          type: 'm.room.message',
          content: {
            'm.relates_to': { rel_type: 'm.replace', event_id: '$other' },
            'm.new_content': { msgtype: 'm.text', body: 'wrong target edit' },
          },
        })
      );
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({ content: { body: 'target original' } });
      expect(timelineItem).not.toHaveProperty('edited');
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toMatchObject({
        body: 'target original',
      });
      expect(source.ok && source.value?.edits).toEqual([]);
    } finally {
      await core.auth.stop();
    }
  });

  it('ignores a bundled replacement with a non-message protocol type', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!wrong-bundled-type:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [{ eventId: '$target', sender: '@alice:example.org', body: 'original' }],
          },
        ],
      });
      const target = driver.client.getRoom(roomId)!.findEventById('$target')!;
      target.makeReplaced(
        new MatrixEvent({
          event_id: '$wrong-type',
          room_id: roomId,
          sender: '@alice:example.org',
          origin_server_ts: 300,
          type: 'org.example.edit',
          content: {
            'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
            'm.new_content': { msgtype: 'm.text', body: 'wrong type edit' },
          },
        })
      );
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({ content: { body: 'original' } });
      expect(timelineItem).not.toHaveProperty('edited');
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.edits).toEqual([]);
    } finally {
      await core.auth.stop();
    }
  });

  it('preserves SDK wire-to-clear content merge with deterministic encrypted edit selection', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!encrypted-source-merge:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [
              { eventId: '$root', sender: '@alice:example.org', body: 'root' },
              {
                eventId: '$encrypted',
                sender: '@alice:example.org',
                body: 'ciphertext',
                encrypted: true,
                replyTo: '$root',
                content: { 'org.example.wire': 'wire-value' },
                decryptedContent: { msgtype: 'm.text', body: 'clear original' },
              },
              {
                eventId: '$edit-z',
                sender: '@alice:example.org',
                body: 'z edit',
                replaces: '$encrypted',
                timestamp: 200,
              },
              {
                eventId: '$edit-a',
                sender: '@alice:example.org',
                body: 'a edit',
                replaces: '$encrypted',
                timestamp: 200,
              },
            ],
          },
        ],
      });
      const target = driver.client.getRoom(roomId)!.findEventById('$encrypted')!;
      const sdkContent = target.getEffectiveEvent().content;
      expect(sdkContent).toMatchObject({
        body: 'a edit',
        'm.relates_to': { 'm.in_reply_to': { event_id: '$root' } },
        'org.example.wire': 'wire-value',
      });
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[1];
      const event = await core.timeline.event(roomId, '$encrypted');
      const source = await core.timeline.source(roomId, '$encrypted');
      const expectedContent = {
        msgtype: 'm.text',
        body: 'z edit',
        'm.relates_to': { 'm.in_reply_to': { event_id: '$root' } },
        'org.example.wire': 'wire-value',
      };
      expect(timelineItem).toMatchObject({
        kind: 'message',
        eventType: 'm.room.encrypted',
        content: { body: 'z edit', raw: expectedContent },
        editEventId: '$edit-z',
      });
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toEqual(expectedContent);
      expect(source.ok && source.value?.event.effective.content).not.toHaveProperty('algorithm');
      expect(source.ok && source.value?.event.effective.content).not.toHaveProperty('ciphertext');
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$edit-z',
        '$edit-a',
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('uses the same deterministic edit for timeline, event and source on equal timestamps', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!edit-tie:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [
              { eventId: '$target', sender: '@alice:example.org', body: 'original' },
              {
                eventId: '$edit-z',
                sender: '@alice:example.org',
                body: 'z edit',
                replaces: '$target',
                timestamp: 200,
              },
              {
                eventId: '$edit-a',
                sender: '@alice:example.org',
                body: 'a edit',
                replaces: '$target',
                timestamp: 200,
              },
            ],
          },
        ],
      });
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({
        content: { body: 'z edit' },
        edited: true,
        editEventId: '$edit-z',
      });
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toMatchObject({ body: 'z edit' });
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$edit-z',
        '$edit-a',
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('includes a true bundled replacement when selecting the newest valid edit', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!bundled-newest:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [
              { eventId: '$target', sender: '@alice:example.org', body: 'original' },
              {
                eventId: '$relation-edit',
                sender: '@alice:example.org',
                body: 'relation edit',
                replaces: '$target',
                timestamp: 200,
              },
            ],
          },
        ],
      });
      const target = driver.client.getRoom(roomId)!.findEventById('$target')!;
      target.makeReplaced(
        new MatrixEvent({
          event_id: '$bundled-newest',
          room_id: roomId,
          sender: '@alice:example.org',
          origin_server_ts: 300,
          type: 'm.room.message',
          content: {
            'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
            'm.new_content': { msgtype: 'm.text', body: 'bundled newest' },
          },
        })
      );
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({
        content: { body: 'bundled newest' },
        editEventId: '$bundled-newest',
      });
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toMatchObject({
        body: 'bundled newest',
      });
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$relation-edit',
        '$bundled-newest',
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('shares owning and projected relation fallback across timeline, event and source', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!relation-fallback:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [{ eventId: '$target', sender: '@alice:example.org', body: 'original' }],
          },
        ],
      });
      const room = driver.client.getRoom(roomId)!;
      const reaction = new MatrixEvent({
        event_id: '$owning-reaction',
        room_id: roomId,
        sender: '@bob:example.org',
        origin_server_ts: 150,
        type: 'm.reaction',
        content: {
          'm.relates_to': { rel_type: 'm.annotation', event_id: '$target', key: '👍' },
        },
      });
      await room.getUnfilteredTimelineSet().relations.aggregateChildEvent(reaction);
      const projectedEdit = new MatrixEvent({
        event_id: '$projected-edit',
        room_id: roomId,
        sender: '@alice:example.org',
        origin_server_ts: 200,
        type: 'm.room.message',
        content: {
          'm.relates_to': { rel_type: 'm.replace', event_id: '$target' },
          'm.new_content': { msgtype: 'm.text', body: 'projected edit' },
        },
      });
      room.getLiveTimeline().addEvent(projectedEdit, {
        toStartOfTimeline: false,
        addToState: false,
      });
      const timelineItem = core.timeline.timeline(roomId).getSnapshot().value.items[0];
      const event = await core.timeline.event(roomId, '$target');
      const source = await core.timeline.source(roomId, '$target');
      expect(timelineItem).toMatchObject({
        content: { body: 'projected edit' },
        editEventId: '$projected-edit',
        reactions: [{ events: [{ eventId: '$owning-reaction' }] }],
      });
      expect(event).toEqual({ ok: true, value: timelineItem });
      expect(source.ok && source.value?.event.effective.content).toMatchObject({
        body: 'projected edit',
      });
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$projected-edit',
      ]);
    } finally {
      await core.auth.stop();
    }
  });

  it('scans a 500-message timeline once for relation fallback', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!relation-scan:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: Array.from({ length: 500 }, (_, index) => ({
              eventId: `$message-${index}`,
              sender: '@alice:example.org',
              body: `message ${index}`,
              timestamp: 1_700_000_000_000 + index,
            })),
          },
        ],
      });
      const timeline = driver.client.getRoom(roomId)!.getLiveTimeline();
      const getEvents = vi.spyOn(timeline, 'getEvents');
      const view = core.timeline.timeline(roomId).getSnapshot().value;
      expect(view.items).toHaveLength(500);
      expect(getEvents).toHaveBeenCalledTimes(1);
    } finally {
      await core.auth.stop();
    }
  });

  it('prefers thread-owned relations over conflicting main-timeline relations', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!thread-relations:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            messages: [
              { eventId: '$root', sender: '@alice:example.org', body: 'root' },
              {
                eventId: '$reply',
                sender: '@bob:example.org',
                body: 'thread reply',
                threadRoot: '$root',
              },
              {
                eventId: '$thread-edit',
                sender: '@bob:example.org',
                body: 'thread edit',
                replaces: '$reply',
                timestamp: 200,
              },
            ],
            reactions: [
              {
                eventId: '$thread-reaction',
                target: '$reply',
                sender: '@carol:example.org',
                key: 'thread',
              },
            ],
          },
        ],
      });
      const room = driver.client.getRoom(roomId)!;
      const thread = room.getThreads().find((entry) => entry.id === '$root');
      expect(thread).toBeDefined();
      if (!thread) throw new Error('Missing thread');
      const sharedRelations = thread.timelineSet.relations.getAllChildEventsForEvent('$reply');
      expect(sharedRelations.map((event) => event.getId())).toEqual([
        '$thread-edit',
        '$thread-reaction',
      ]);
      // This SDK version shares the room relation container; isolate it to verify owning-set priority.
      expect(room.getUnfilteredTimelineSet().relations.getAllChildEventsForEvent('$reply')).toEqual(
        sharedRelations
      );
      const threadRelations = new RelationsContainer(driver.client);
      await threadRelations.aggregateChildEvent(sharedRelations[0]!);
      await threadRelations.aggregateChildEvent(sharedRelations[1]!);
      Object.defineProperty(thread.timelineSet, 'relations', { value: threadRelations });
      expect(
        core.timeline
          .timeline(roomId)
          .getSnapshot()
          .value.items.map((item) => item.eventId)
      ).toEqual(['$root']);

      const mainEdit = new MatrixEvent({
        event_id: '$main-edit',
        room_id: roomId,
        sender: '@bob:example.org',
        origin_server_ts: 900,
        type: 'm.room.message',
        content: {
          'm.relates_to': { rel_type: 'm.replace', event_id: '$reply' },
          'm.new_content': { msgtype: 'm.text', body: 'main edit' },
        },
      });
      const mainReaction = new MatrixEvent({
        event_id: '$main-reaction',
        room_id: roomId,
        sender: '@dave:example.org',
        origin_server_ts: 901,
        type: 'm.reaction',
        content: {
          'm.relates_to': { rel_type: 'm.annotation', event_id: '$reply', key: 'main' },
        },
      });
      await room.getUnfilteredTimelineSet().relations.aggregateChildEvent(mainEdit);
      await room.getUnfilteredTimelineSet().relations.aggregateChildEvent(mainReaction);
      const event = await core.timeline.event(roomId, '$reply');
      const source = await core.timeline.source(roomId, '$reply');
      expect(event).toMatchObject({
        ok: true,
        value: {
          content: { body: 'thread edit' },
          editEventId: '$thread-edit',
          reactions: [{ events: [{ eventId: '$thread-reaction' }] }],
        },
      });
      expect(source.ok && source.value?.edits.map((edit) => edit.original.event_id)).toEqual([
        '$thread-edit',
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
