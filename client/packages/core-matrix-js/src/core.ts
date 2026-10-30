import {
  createSnapshotStore,
  type CoreResult,
  type HarrierCore,
  type JsonObject,
  type Membership,
  type RoomSummaryView,
  type TimelineItem,
  type TimelineView,
  type WritableSnapshotStore,
} from '@harrier/core';
import { ClientEvent, EventType, MatrixClient, MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';

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

const isEdit = (event: MatrixEvent): boolean => event.getRelation()?.rel_type === 'm.replace';

const toTimelineView = (roomId: string, events: readonly MatrixEvent[]): TimelineView => {
  const latestEdit = new Map<string, string>();
  events.forEach((event) => {
    if (!isEdit(event)) return;
    const target = event.getRelation()?.event_id;
    const body = event.getContent<{ 'm.new_content'?: { body?: unknown } }>()['m.new_content']
      ?.body;
    if (target && typeof body === 'string') latestEdit.set(target, body);
  });

  const items = events
    .filter((event) => !isEdit(event) && event.getType() === 'm.room.message')
    .map((event): TimelineItem => {
      const eventId = event.getId() ?? '';
      const content = event.getContent<{ msgtype?: string; body?: string }>();
      return {
        kind: 'message',
        eventId,
        roomId,
        sender: event.getSender() ?? '',
        timestamp: event.getTs(),
        content: {
          msgtype: content.msgtype ?? 'm.text',
          body: latestEdit.get(eventId) ?? content.body ?? '',
        },
        status: 'sent',
      };
    });

  return { roomId, items, hasBackwardHistory: false };
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

  const timelines = new Map<string, WritableSnapshotStore<TimelineView>>();
  const buildTimeline = (roomId: string) =>
    toTimelineView(roomId, client.getRoom(roomId)?.getLiveTimeline().getEvents() ?? []);
  client.on(RoomEvent.Timeline, (_event: MatrixEvent, room: Room | undefined) => {
    if (!room) return;
    timelines.get(room.roomId)?.publish(buildTimeline(room.roomId));
  });

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
      async children(roomId): Promise<CoreResult<readonly string[]>> {
        const room = client.getRoom(roomId);
        const events = room?.currentState.getStateEvents(EventType.SpaceChild) ?? [];
        const ids = events
          .filter((event) => Array.isArray(event.getContent<{ via?: unknown }>().via))
          .map((event) => event.getStateKey())
          .filter((key): key is string => typeof key === 'string' && key.length > 0);
        return { ok: true, value: ids };
      },
    },
    timeline: {
      timeline(roomId) {
        const existing = timelines.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildTimeline(roomId));
        timelines.set(roomId, store);
        return store;
      },
      paginateBackward: notImplemented('timeline.paginateBackward'),
    },
  };
}
