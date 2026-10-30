import { ClientEvent, createClient, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

export const TEST_USER_ID = '@tester:example.org';

export type SyncFixtureRoom = {
  readonly roomId: string;
  readonly membership: 'join' | 'invite' | 'leave';
  readonly name?: string;
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
};

export type SyncDriver = {
  readonly client: MatrixClient;
  applyFixture(fixture: SyncFixture): Promise<void>;
};

let eventCounter = 0;

function stateEvent(roomId: string, type: string, content: Record<string, unknown>): MatrixEvent {
  eventCounter += 1;
  return new MatrixEvent({
    type,
    state_key: '',
    sender: TEST_USER_ID,
    room_id: roomId,
    event_id: `$fixture${eventCounter}`,
    origin_server_ts: 1_700_000_000_000 + eventCounter,
    content,
  });
}

export function createSyncDriver(): SyncDriver {
  const client = createClient({
    baseUrl: 'https://matrix.example.org',
    userId: TEST_USER_ID,
    accessToken: 'test-token',
  });

  return {
    client,
    async applyFixture(fixture) {
      fixture.rooms.forEach((item) => {
        const room = new Room(item.roomId, client, TEST_USER_ID);
        client.store.storeRoom(room);
        room.updateMyMembership(item.membership);
        if (item.name !== undefined) {
          const event = stateEvent(item.roomId, 'm.room.name', { name: item.name });
          room.currentState.setStateEvents([event]);
          room.recalculate();
        }
        client.emit(ClientEvent.Room, room);
      });
    },
  };
}
