import {
  createSnapshotStore,
  type CoreResult,
  type HarrierCore,
  type JsonObject,
  type Membership,
  type RoomSummaryView,
} from '@harrier/core';
import { ClientEvent, EventType, MatrixClient, Room, RoomEvent } from 'matrix-js-sdk';

const notImplemented = (name: string) => () => {
  throw new Error(`${name} is not implemented yet`);
};

const MEMBERSHIPS: readonly Membership[] = ['join', 'invite', 'leave', 'ban', 'knock'];

const toMembership = (value: string | null | undefined): Membership | null =>
  MEMBERSHIPS.find((membership) => membership === value) ?? null;

const directRoomIds = (client: MatrixClient): Set<string> => {
  const content = client.getAccountData(EventType.Direct)?.getContent<Record<string, unknown>>();
  const ids = new Set<string>();
  Object.values(content ?? {}).forEach((rooms) => {
    if (Array.isArray(rooms)) rooms.forEach((id) => typeof id === 'string' && ids.add(id));
  });
  return ids;
};

const toSummary = (room: Room, direct: Set<string>): RoomSummaryView | null => {
  const membership = toMembership(room.getMyMembership());
  if (!membership) return null;
  return {
    roomId: room.roomId,
    name: room.name,
    membership,
    isDirect: direct.has(room.roomId),
    isSpace: room.isSpaceRoom(),
  };
};

export function createMatrixJsCore(client: MatrixClient): HarrierCore {
  const joined = () => {
    const direct = directRoomIds(client);
    return client
      .getRooms()
      .filter((room) => room.getMyMembership() === 'join')
      .map((room) => toSummary(room, direct))
      .filter((summary): summary is RoomSummaryView => summary !== null);
  };

  const roomsStore = createSnapshotStore<readonly RoomSummaryView[]>(joined());
  const refresh = () => roomsStore.publish(joined());
  client.on(ClientEvent.Room, refresh);
  client.on(RoomEvent.MyMembership, refresh);
  client.on(ClientEvent.AccountData, refresh);

  return {
    capabilities: { calls: false, threads: false },
    auth: {
      session: createSnapshotStore(null),
      sync: createSnapshotStore({ phase: 'idle' as const }),
      start: notImplemented('auth.start'),
      stop: notImplemented('auth.stop'),
      logout: notImplemented('auth.logout'),
    },
    rooms: {
      list: roomsStore,
      room: notImplemented('rooms.room'),
      members: notImplemented('rooms.members'),
      async getState(roomId, eventType, stateKey): Promise<CoreResult<JsonObject | null>> {
        const room = client.getRoom(roomId);
        const event = room?.currentState.getStateEvents(eventType, stateKey) ?? null;
        return { ok: true, value: event ? (event.getContent() as JsonObject) : null };
      },
    },
    timeline: {
      timeline: notImplemented('timeline.timeline'),
      paginateBackward: notImplemented('timeline.paginateBackward'),
    },
  };
}
