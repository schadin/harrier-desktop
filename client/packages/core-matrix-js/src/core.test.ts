import {
  ClientEvent,
  EventStatus,
  HttpApiEvent,
  MatrixError,
  MatrixEvent,
  RoomEvent,
  RoomStateEvent,
  SyncState,
  type MatrixClient,
  type Room,
} from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver } from './testing/driver';

const stateEvent = (
  roomId: string,
  eventId: string,
  content: Record<string, unknown>,
  type = 'm.room.topic'
): MatrixEvent =>
  new MatrixEvent({
    type,
    state_key: '',
    sender: '@alice:example.org',
    room_id: roomId,
    event_id: eventId,
    origin_server_ts: 1,
    content,
  });

const queueStateEvent = (client: MatrixClient, room: Room, event: MatrixEvent) => {
  room.currentState.setStateEvents([event]);
  client.emit(RoomStateEvent.Events, event, room.currentState, null);
};

const messageEvent = (roomId: string, eventId: string, body: string, timestamp: number) => {
  const event = new MatrixEvent({
    type: 'm.room.message',
    sender: '@alice:example.org',
    room_id: roomId,
    event_id: eventId,
    origin_server_ts: timestamp,
    content: { msgtype: 'm.text', body },
  });
  event.setStatus(EventStatus.SENT);
  return event;
};

const addTimelineEvent = (room: Room, event: MatrixEvent) => {
  room.getLiveTimeline().addEvent(event, { toStartOfTimeline: false, addToState: false });
};

const emitTimeline = (client: MatrixClient, event: MatrixEvent, room: Room) => {
  client.emit(RoomEvent.Timeline, event, room, false, false, {
    timeline: room.getLiveTimeline(),
    liveEvent: true,
  });
};

describe('matrix-js UIA fallback auth', () => {
  it('forwards the stage and session to the current SDK client without HTTP requests', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const fallbackSpy = vi.spyOn(driver.client, 'getFallbackAuthUrl');
    const requestSpy = vi.spyOn(driver.client.http, 'authedRequest');
    try {
      const authSessionId = 'uia session+/=&?';
      const sessionBefore = core.auth.session.getSnapshot();
      const first = core.auth.fallbackAuthUrl('m.login.sso', authSessionId);
      const second = core.auth.fallbackAuthUrl('m.login.sso', authSessionId);

      expect(fallbackSpy).toHaveBeenNthCalledWith(1, 'm.login.sso', authSessionId);
      expect(fallbackSpy).toHaveBeenNthCalledWith(2, 'm.login.sso', authSessionId);
      expect(second).toBe(first);
      expect(core.auth.session.getSnapshot()).toBe(sessionBefore);
      expect(requestSpy).not.toHaveBeenCalled();
    } finally {
      fallbackSpy.mockRestore();
      requestSpy.mockRestore();
      await core.auth.stop();
    }
  });

  it('does not call the SDK for an empty stage or session', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const fallbackSpy = vi.spyOn(driver.client, 'getFallbackAuthUrl');
    try {
      expect(core.auth.fallbackAuthUrl('', 'uia-session')).toBeNull();
      expect(core.auth.fallbackAuthUrl('m.login.sso', '')).toBeNull();
      expect(fallbackSpy).not.toHaveBeenCalled();
    } finally {
      fallbackSpy.mockRestore();
      await core.auth.stop();
    }
  });

  it('returns null when SDK fallback URL construction throws', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const fallbackSpy = vi.spyOn(driver.client, 'getFallbackAuthUrl').mockImplementation(() => {
      throw new Error('Unable to build fallback URL');
    });
    try {
      expect(core.auth.fallbackAuthUrl('m.login.sso', 'uia-session')).toBeNull();
    } finally {
      fallbackSpy.mockRestore();
      await core.auth.stop();
    }
  });
});

describe('matrix-js core state listener flushing', () => {
  it('does not flush another room with the same event id', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomAId = '!a:example.org';
    const roomBId = '!b:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          { roomId: roomAId, membership: 'join', name: 'A' },
          { roomId: roomBId, membership: 'join', name: 'B' },
        ],
      });
      const roomA = driver.client.getRoom(roomAId)!;
      const roomB = driver.client.getRoom(roomBId)!;
      const eventA = stateEvent(roomAId, '$same-id', { topic: 'A topic' });
      const eventB = stateEvent(roomBId, '$same-id', { topic: 'B topic' });
      queueStateEvent(driver.client, roomA, eventA);
      queueStateEvent(driver.client, roomB, eventB);
      const observedRooms: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedRooms.push(entry.roomId));

      try {
        driver.client.emit(ClientEvent.Event, eventA);
        expect(observedRooms).toEqual([roomAId]);

        driver.client.emit(ClientEvent.Event, eventB);
        expect(observedRooms).toEqual([roomAId, roomBId]);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('recalculates pending rooms before a successful sync fallback flush', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!sync-flush:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const event = stateEvent(roomId, '$sync-name', { name: 'New name' }, 'm.room.name');
      queueStateEvent(driver.client, room, event);
      let observedName: string | undefined;
      const unsubscribe = core.rooms.onState(() => {
        observedName = core.rooms.room(roomId).getSnapshot().value?.name;
      });

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);
        expect(observedName).toBe('New name');
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('publishes every recalculated room before sync fallback listeners run', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomAId = '!batch-a:example.org';
    const roomBId = '!batch-b:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          { roomId: roomAId, membership: 'join', name: 'Old A', roomVersion: '10' },
          { roomId: roomBId, membership: 'join', name: 'Old B', roomVersion: '10' },
        ],
      });
      const roomA = driver.client.getRoom(roomAId)!;
      const roomB = driver.client.getRoom(roomBId)!;
      queueStateEvent(
        driver.client,
        roomA,
        stateEvent(roomAId, '$batch-name-a', { name: 'New A' }, 'm.room.name')
      );
      queueStateEvent(
        driver.client,
        roomB,
        stateEvent(roomBId, '$batch-name-b', { name: 'New B' }, 'm.room.name')
      );
      const initialRevision = core.rooms.all.getSnapshot().revision;
      const observedRoomIds: string[] = [];
      const observedNames: Array<[string | undefined, string | undefined]> = [];
      const unsubscribe = core.rooms.onState((entry) => {
        observedRoomIds.push(entry.roomId);
        if (entry.roomId !== roomAId) return;
        observedNames.push([
          core.rooms.room(roomAId).getSnapshot().value?.name,
          core.rooms.room(roomBId).getSnapshot().value?.name,
        ]);
      });

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);

        expect(observedRoomIds).toEqual([roomAId, roomBId]);
        expect(observedNames).toEqual([['New A', 'New B']]);
        expect(core.rooms.all.getSnapshot().revision).toBe(initialRevision + 1);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('does not publish pending state on sync error or stopped', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!sync-error:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const event = stateEvent(roomId, '$name-change', { name: 'New name' }, 'm.room.name');
      queueStateEvent(driver.client, room, event);
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
        driver.client.emit(ClientEvent.Sync, SyncState.Stopped, SyncState.Error);
        driver.client.emit(ClientEvent.Event, event);
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Stopped);

        expect(observedTypes).toEqual([]);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('flushes new state events after a transient sync error without retrySync', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!sync-recovery:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name', roomVersion: '10' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const staleEvent = stateEvent(roomId, '$stale-name', { name: 'Stale name' }, 'm.room.name');
      queueStateEvent(driver.client, room, staleEvent);
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
        const freshEvent = stateEvent(roomId, '$fresh-topic', { topic: 'Fresh topic' });
        queueStateEvent(driver.client, room, freshEvent);
        driver.client.emit(ClientEvent.Event, freshEvent);
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Error);

        expect(observedTypes).toEqual(['m.room.topic']);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('does not reactivate stopped state listeners until explicit start', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!sync-stopped:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name', roomVersion: '10' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));

      try {
        await core.auth.stop();
        const stoppedEvent = stateEvent(roomId, '$while-stopped', { topic: 'While stopped' });
        queueStateEvent(driver.client, room, stoppedEvent);
        driver.client.emit(ClientEvent.Event, stoppedEvent);
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Stopped);

        expect(observedTypes).toEqual([]);

        driver.client.startClient = async () => undefined;
        const startResult = await core.auth.start();
        expect(startResult.ok).toBe(true);
        const startedEvent = stateEvent(roomId, '$after-start', { topic: 'After start' });
        queueStateEvent(driver.client, room, startedEvent);
        driver.client.emit(ClientEvent.Event, startedEvent);

        expect(observedTypes).toEqual(['m.room.topic']);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('defers room and state projections after a timeline event during transient sync error', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!error-timeline:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const allStore = core.rooms.all;
      const listStore = core.rooms.list;
      const roomStore = core.rooms.room(roomId);
      const stateStore = core.rooms.state(roomId, 'm.room.name');
      const allBefore = allStore.getSnapshot();
      const listBefore = listStore.getSnapshot();
      const roomBefore = roomStore.getSnapshot();
      const stateBefore = stateStore.getSnapshot();
      const observedNames: Array<string | undefined> = [];
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId === roomId && entry.eventType === 'm.room.name') {
          observedNames.push(roomStore.getSnapshot().value?.name);
        }
      });

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
        const event = stateEvent(roomId, '$error-name', { name: 'New name' }, 'm.room.name');
        queueStateEvent(driver.client, room, event);
        emitTimeline(driver.client, event, room);

        expect(allStore.getSnapshot()).toBe(allBefore);
        expect(listStore.getSnapshot()).toBe(listBefore);
        expect(roomStore.getSnapshot()).toBe(roomBefore);
        expect(stateStore.getSnapshot()).toBe(stateBefore);
        expect(observedNames).toEqual([]);

        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Error);

        expect(allStore.getSnapshot().value[0]?.name).toBe('New name');
        expect(listStore.getSnapshot().value[0]?.name).toBe('New name');
        expect(roomStore.getSnapshot().value?.name).toBe('New name');
        expect(stateStore.getSnapshot().value).toEqual({ name: 'New name' });
        expect(observedNames).toEqual(['New name']);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it.each(['stop', 'logout'] as const)(
    'does not publish room, state or timeline snapshots after %s',
    async (lifecycle) => {
      const driver = createSyncDriver();
      const core = createMatrixJsCore(driver.client);
      const roomId = `!timeline-${lifecycle}:example.org`;
      try {
        await driver.applyFixture({
          rooms: [
            {
              roomId,
              membership: 'join',
              name: 'Old name',
              messages: [
                {
                  eventId: '$initial',
                  sender: '@alice:example.org',
                  body: 'Initial',
                  timestamp: 100,
                },
              ],
            },
          ],
        });
        const room = driver.client.getRoom(roomId)!;
        const allStore = core.rooms.all;
        const listStore = core.rooms.list;
        const roomStore = core.rooms.room(roomId);
        const stateStore = core.rooms.state(roomId, 'm.room.name');
        const timelineStore = core.timeline.timeline(roomId);
        queueStateEvent(
          driver.client,
          room,
          stateEvent(roomId, '$late-name', { name: 'New name' }, 'm.room.name')
        );
        const lateEvent = messageEvent(roomId, '$late-message', 'Late message', 200);
        addTimelineEvent(room, lateEvent);
        const allBefore = allStore.getSnapshot();
        const listBefore = listStore.getSnapshot();
        const roomBefore = roomStore.getSnapshot();
        const stateBefore = stateStore.getSnapshot();
        const timelineBefore = timelineStore.getSnapshot();
        const observedTypes: string[] = [];
        const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));

        try {
          if (lifecycle === 'stop') await core.auth.stop();
          if (lifecycle === 'logout') await core.auth.logout();
          emitTimeline(driver.client, lateEvent, room);

          expect(allStore.getSnapshot()).toBe(allBefore);
          expect(listStore.getSnapshot()).toBe(listBefore);
          expect(roomStore.getSnapshot()).toBe(roomBefore);
          expect(stateStore.getSnapshot()).toBe(stateBefore);
          expect(timelineStore.getSnapshot()).toBe(timelineBefore);
          expect(observedTypes).toEqual([]);
        } finally {
          unsubscribe();
        }
      } finally {
        await core.auth.stop();
      }
    }
  );

  it('publishes one complete multi-room batch after suppressed timeline and name events', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomAId = '!suppressed-a:example.org';
    const roomBId = '!suppressed-b:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          { roomId: roomAId, membership: 'join', name: 'Old A' },
          { roomId: roomBId, membership: 'join', name: 'Old B' },
        ],
      });
      const roomA = driver.client.getRoom(roomAId)!;
      const roomB = driver.client.getRoom(roomBId)!;
      const allStore = core.rooms.all;
      const stateAStore = core.rooms.state(roomAId, 'm.room.name');
      const timelineStore = core.timeline.timeline(roomAId);
      const duringBatch = messageEvent(roomAId, '$during-batch', 'During batch', 300);
      addTimelineEvent(roomA, duringBatch);
      queueStateEvent(
        driver.client,
        roomA,
        stateEvent(roomAId, '$suppressed-name-a', { name: 'New A' }, 'm.room.name')
      );
      queueStateEvent(
        driver.client,
        roomB,
        stateEvent(roomBId, '$suppressed-name-b', { name: 'New B' }, 'm.room.name')
      );
      const initialRevision = allStore.getSnapshot().revision;
      const initialTimelineRevision = timelineStore.getSnapshot().revision;
      const roomNames = () => allStore.getSnapshot().value.map((room) => room.name);
      const observedRoomNames: string[][] = [];
      const observedStateRoomNames: string[][] = [];
      const observedTimelineEventIds: string[][] = [];
      const unsubscribeAll = allStore.subscribe(() => observedRoomNames.push(roomNames()));
      const unsubscribeState = stateAStore.subscribe(() =>
        observedStateRoomNames.push(roomNames())
      );
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId === roomAId) {
          observedTimelineEventIds.push(
            timelineStore.getSnapshot().value.items.map((item) => item.eventId)
          );
        }
      });
      const recalculate = roomA.recalculate.bind(roomA);
      let emitted = false;
      const recalculateSpy = vi.spyOn(roomA, 'recalculate').mockImplementation(() => {
        recalculate();
        if (emitted) return;
        emitted = true;
        driver.client.emit(RoomEvent.Name, roomA);
        emitTimeline(driver.client, duringBatch, roomA);
      });

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);

        expect(observedRoomNames).toEqual([['New A', 'New B']]);
        expect(observedStateRoomNames).toEqual([['New A', 'New B']]);
        expect(observedTimelineEventIds).toEqual([['$during-batch']]);
        expect(allStore.getSnapshot().revision).toBe(initialRevision + 1);
        expect(timelineStore.getSnapshot().revision).toBe(initialTimelineRevision + 1);
        expect(timelineStore.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
          '$during-batch',
        ]);
      } finally {
        unsubscribe();
        unsubscribeState();
        unsubscribeAll();
        recalculateSpy.mockRestore();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('publishes timeline progress without room projections during transient sync error', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!error-progress:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            name: 'Room',
            messages: [
              {
                eventId: '$initial',
                sender: '@alice:example.org',
                body: 'Initial',
                timestamp: 100,
              },
            ],
          },
        ],
      });
      const room = driver.client.getRoom(roomId)!;
      const allStore = core.rooms.all;
      const roomStore = core.rooms.room(roomId);
      const timelineStore = core.timeline.timeline(roomId);
      const allBefore = allStore.getSnapshot();
      const roomBefore = roomStore.getSnapshot();
      const timelineBefore = timelineStore.getSnapshot();

      driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
      const event = messageEvent(roomId, '$during-error', 'During error', 200);
      addTimelineEvent(room, event);
      emitTimeline(driver.client, event, room);

      expect(timelineStore.getSnapshot().revision).toBe(timelineBefore.revision + 1);
      expect(timelineStore.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
        '$initial',
        '$during-error',
      ]);
      expect(allStore.getSnapshot()).toBe(allBefore);
      expect(roomStore.getSnapshot()).toBe(roomBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('refreshes room projections on successful sync without pending state', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!empty-sync-refresh:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            name: 'Room',
            messages: [
              {
                eventId: '$initial',
                sender: '@alice:example.org',
                body: 'Initial',
                timestamp: 100,
              },
            ],
          },
        ],
      });
      const room = driver.client.getRoom(roomId)!;
      const allStore = core.rooms.all;
      const listStore = core.rooms.list;
      const roomStore = core.rooms.room(roomId);
      const allBefore = allStore.getSnapshot();
      const listBefore = listStore.getSnapshot();
      const roomBefore = roomStore.getSnapshot();

      driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
      addTimelineEvent(room, messageEvent(roomId, '$unpublished', 'Unpublished', 200));
      driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Error);

      expect(allStore.getSnapshot().revision).toBe(allBefore.revision + 1);
      expect(listStore.getSnapshot().revision).toBe(listBefore.revision + 1);
      expect(roomStore.getSnapshot().revision).toBe(roomBefore.revision + 1);
      expect(allStore.getSnapshot().value[0]?.lastActiveTimestamp).toBe(200);
      expect(listStore.getSnapshot().value[0]?.lastActiveTimestamp).toBe(200);
      expect(roomStore.getSnapshot().value?.lastActiveTimestamp).toBe(200);
    } finally {
      await core.auth.stop();
    }
  });

  it('defers reentrant generic state flushes while a multi-room batch is suppressed', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomAId = '!reentrant-a:example.org';
    const roomBId = '!reentrant-b:example.org';
    try {
      await driver.applyFixture({
        rooms: [
          { roomId: roomAId, membership: 'join', name: 'Old A' },
          { roomId: roomBId, membership: 'join', name: 'Old B' },
        ],
      });
      const roomA = driver.client.getRoom(roomAId)!;
      const roomB = driver.client.getRoom(roomBId)!;
      const allStore = core.rooms.all;
      const topicStore = core.rooms.state(roomAId, 'm.room.topic');
      queueStateEvent(
        driver.client,
        roomA,
        stateEvent(roomAId, '$reentrant-name-a', { name: 'New A' }, 'm.room.name')
      );
      queueStateEvent(
        driver.client,
        roomB,
        stateEvent(roomBId, '$reentrant-name-b', { name: 'New B' }, 'm.room.name')
      );
      const reentrantTopic = stateEvent(roomAId, '$reentrant-topic', { topic: 'Reentrant topic' });
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));
      const recalculate = roomA.recalculate.bind(roomA);
      let injected = false;
      const recalculateSpy = vi.spyOn(roomA, 'recalculate').mockImplementation(() => {
        recalculate();
        if (injected) return;
        injected = true;
        queueStateEvent(driver.client, roomA, reentrantTopic);
        driver.client.emit(ClientEvent.Event, reentrantTopic);
      });
      const initialRevision = allStore.getSnapshot().revision;

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);

        expect(observedTypes).toEqual(['m.room.name', 'm.room.name']);
        expect(allStore.getSnapshot().value.map((room) => room.name)).toEqual(['New A', 'New B']);
        expect(allStore.getSnapshot().revision).toBe(initialRevision + 1);
        expect(topicStore.getSnapshot().value).toEqual({ topic: 'Reentrant topic' });

        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);

        expect(observedTypes).toEqual(['m.room.name', 'm.room.name', 'm.room.topic']);
      } finally {
        unsubscribe();
        recalculateSpy.mockRestore();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('stops remaining projections when a snapshot listener shuts down the lifecycle', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!reentrant-stop:example.org';
    try {
      await driver.applyFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name' }],
      });
      const room = driver.client.getRoom(roomId)!;
      const allStore = core.rooms.all;
      const listStore = core.rooms.list;
      const roomStore = core.rooms.room(roomId);
      const stateStore = core.rooms.state(roomId, 'm.room.name');
      queueStateEvent(
        driver.client,
        room,
        stateEvent(roomId, '$reentrant-stop-name', { name: 'New name' }, 'm.room.name')
      );
      const allBefore = allStore.getSnapshot();
      const listBefore = listStore.getSnapshot();
      const roomBefore = roomStore.getSnapshot();
      const stateBefore = stateStore.getSnapshot();
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));
      let stopped = false;
      const unsubscribeAll = allStore.subscribe(() => {
        if (stopped) return;
        stopped = true;
        core.auth.stop().catch(() => undefined);
      });

      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);

        expect(stopped).toBe(true);
        expect(allStore.getSnapshot().revision).toBe(allBefore.revision + 1);
        expect(listStore.getSnapshot()).toBe(listBefore);
        expect(roomStore.getSnapshot()).toBe(roomBefore);
        expect(stateStore.getSnapshot()).toBe(stateBefore);
        expect(observedTypes).toEqual([]);
      } finally {
        unsubscribeAll();
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it.each(['stop', 'logout', 'clearCache', 'sessionLoggedOut'] as const)(
    'drops pending state and ignores late callbacks after %s',
    async (lifecycle) => {
      const driver = createSyncDriver();
      const core = createMatrixJsCore(driver.client);
      const roomId = `!${lifecycle}:example.org`;
      try {
        await driver.applyFixture({
          rooms: [{ roomId, membership: 'join', name: 'Old name' }],
        });
        const room = driver.client.getRoom(roomId)!;
        const event = stateEvent(roomId, '$pending', { name: 'New name' }, 'm.room.name');
        queueStateEvent(driver.client, room, event);
        const observedTypes: string[] = [];
        const unsubscribe = core.rooms.onState((entry) => observedTypes.push(entry.eventType));

        try {
          if (lifecycle === 'stop') await core.auth.stop();
          if (lifecycle === 'logout') await core.auth.logout();
          if (lifecycle === 'clearCache') await core.auth.clearCache();
          if (lifecycle === 'sessionLoggedOut') {
            driver.client.emit(
              HttpApiEvent.SessionLoggedOut,
              new MatrixError({ errcode: 'M_UNKNOWN_TOKEN', error: 'Logged out' })
            );
          }

          driver.client.emit(RoomStateEvent.Events, event, room.currentState, null);
          driver.client.emit(ClientEvent.Event, event);
          driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Stopped);

          expect(observedTypes).toEqual([]);
        } finally {
          unsubscribe();
        }
      } finally {
        await core.auth.stop();
      }
    }
  );
});

describe('matrix-js core local validation errors', () => {
  it('keeps deliberate local failures typed instead of converting them to unknown', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    driver.client.getCrypto = () => undefined;
    try {
      const missingRoom = await core.send.sendMessage('!missing:example.org', { body: 'Hello' });
      expect(missingRoom.ok).toBe(false);
      if (!missingRoom.ok) expect(missingRoom.error.code).toBe('not-found');

      const unsupported = await core.crypto.backup.restore();
      expect(unsupported.ok).toBe(false);
      if (!unsupported.ok) expect(unsupported.error.code).toBe('unsupported');

      const invalidFilename = await core.media.download({ mxcUrl: 'mxc://example.org/media' }, '');
      expect(invalidFilename.ok).toBe(false);
      if (!invalidFilename.ok) expect(invalidFilename.error.code).toBe('invalid-request');
    } finally {
      await core.auth.stop();
    }
  });
});

describe('matrix-js federated room queries', () => {
  it('forwards readonly via servers and logs the encoded summary transport call', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!federated:remote.example';
    const via = ['remote.example', 'backup.example'] as const;
    driver.setRoomSummaryResponse(roomId, { room_id: roomId, name: 'Federated Room' });
    const summarySpy = vi.spyOn(driver.client, 'getRoomSummary');
    try {
      expect(await core.rooms.summary(roomId, via)).toStrictEqual({
        ok: true,
        value: { roomId, name: 'Federated Room' },
      });
      expect(summarySpy).toHaveBeenCalledWith(roomId, [...via]);
      const summaryCalls = driver.getCalls().filter((call) => call.path.includes('/summary/'));
      expect(summaryCalls).toHaveLength(1);
      expect(summaryCalls[0]).toMatchObject({
        method: 'GET',
        path: `/summary/${encodeURIComponent(roomId)}`,
        query: { via: [...via] },
      });
    } finally {
      summarySpy.mockRestore();
      await core.auth.stop();
    }
  });

  it('uses both SDK summary routes with the same via servers after M_UNRECOGNIZED', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!fallback:remote.example';
    const via = ['remote.example'];
    driver.setRoomSummaryResponse(roomId, { room_id: roomId });
    try {
      driver.failNextOperation('/summary/', {
        httpStatus: 400,
        errcode: 'M_UNRECOGNIZED',
        error: 'Use fallback',
      });
      expect(await core.rooms.summary(roomId, via)).toStrictEqual({
        ok: true,
        value: { roomId },
      });
      const summaryCalls = driver
        .getCalls()
        .filter((call) => call.path.includes('/summary/') || call.path.endsWith('/summary'));
      expect(summaryCalls.map((call) => call.path)).toEqual([
        `/summary/${encodeURIComponent(roomId)}`,
        `/rooms/${encodeURIComponent(roomId)}/summary`,
      ]);
      expect(summaryCalls.map((call) => call.query?.via)).toEqual([via, via]);
    } finally {
      await core.auth.stop();
    }
  });

  it('makes one third-party request and does not fall back on M_UNRECOGNIZED', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    driver.setThirdPartyProtocolsResponse({});
    try {
      driver.failNextOperation('/thirdparty/protocols', {
        httpStatus: 400,
        errcode: 'M_UNRECOGNIZED',
        error: 'Unsupported endpoint',
      });
      const result = await core.rooms.thirdPartyProtocols();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: 'invalid-request',
          httpStatus: 400,
          errcode: 'M_UNRECOGNIZED',
        });
      }
      const calls = driver.getCalls().filter((call) => call.path === '/thirdparty/protocols');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe('GET');
    } finally {
      await core.auth.stop();
    }
  });
});
