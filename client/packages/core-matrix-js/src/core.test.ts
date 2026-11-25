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
