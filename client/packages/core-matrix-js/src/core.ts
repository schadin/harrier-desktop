import {
  createSnapshotStore,
  type HarrierCore,
  type Membership,
  type RoomSummaryView,
} from '@harrier/core';
import { ClientEvent, MatrixClient, Room, RoomEvent } from 'matrix-js-sdk';

const notImplemented = (name: string) => () => {
  throw new Error(`${name} is not implemented yet`);
};

const toMembership = (value: string | null | undefined): Membership | null => {
  if (
    value === 'join' ||
    value === 'invite' ||
    value === 'leave' ||
    value === 'ban' ||
    value === 'knock'
  ) {
    return value;
  }
  return null;
};

const toSummary = (room: Room): RoomSummaryView | null => {
  const membership = toMembership(room.getMyMembership());
  if (!membership) return null;
  return {
    roomId: room.roomId,
    name: room.name,
    membership,
    isDirect: false,
    isSpace: room.isSpaceRoom(),
  };
};

export function createMatrixJsCore(client: MatrixClient): HarrierCore {
  const joined = () =>
    client
      .getRooms()
      .filter((room) => room.getMyMembership() === 'join')
      .map(toSummary)
      .filter((summary): summary is RoomSummaryView => summary !== null);

  const roomsStore = createSnapshotStore<readonly RoomSummaryView[]>(joined());
  const refresh = () => roomsStore.publish(joined());
  client.on(ClientEvent.Room, refresh);
  client.on(RoomEvent.MyMembership, refresh);

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
      getState: notImplemented('rooms.getState'),
    },
    timeline: {
      timeline: notImplemented('timeline.timeline'),
      paginateBackward: notImplemented('timeline.paginateBackward'),
    },
  };
}
