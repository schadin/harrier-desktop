import {
  ClientEvent,
  HttpApiEvent,
  MatrixError,
  MatrixEvent,
  RoomStateEvent,
  SyncState,
  type MatrixClient,
  type Room,
} from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
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
