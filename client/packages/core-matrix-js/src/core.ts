import {
  createSnapshotStore,
  type CoreResult,
  type HarrierCore,
  type JsonObject,
  type Membership,
  type NotificationMode,
  type PresenceView,
  type ReactionCountView,
  type RoomSummaryView,
  type SendStatus,
  type TimelineItem,
  type TimelineView,
  type WritableSnapshotStore,
} from '@harrier/core';
import {
  ClientEvent,
  EventType,
  EventStatus,
  EventTimeline,
  MatrixClient,
  MatrixEvent,
  NotificationCountType,
  Room,
  RoomEvent,
  RoomMemberEvent,
  User,
  UserEvent,
} from 'matrix-js-sdk';

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

type PushRule = { actions?: unknown[]; rule_id?: string };

const notificationModeOf = (client: MatrixClient, roomId: string): NotificationMode => {
  const content = client
    .getAccountData(EventType.PushRules)
    ?.getContent<{ global?: { override?: PushRule[] } }>();
  const rule = content?.global?.override?.find((item) => item.rule_id === roomId);
  if (!rule) return 'all';
  const actions = rule.actions ?? [];
  if (actions.length === 0 || actions[0] === 'dont_notify') return 'mute';
  return actions[0] === 'notify' ? 'all' : 'mentions';
};

const toSummary = (
  room: Room,
  direct: Set<string>,
  client: MatrixClient
): RoomSummaryView | null => {
  const membership = toMembership(room.getMyMembership());
  if (!membership) return null;
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
  return {
    roomId: room.roomId,
    name: room.name,
    membership,
    isDirect: direct.has(room.roomId),
    isSpace: room.isSpaceRoom(),
    ...(total > 0 || highlight > 0 ? { unread: { total, highlight } } : {}),
    notificationMode: notificationModeOf(client, room.roomId),
  };
};

const isEdit = (event: MatrixEvent): boolean => event.getRelation()?.rel_type === 'm.replace';

const toSendStatus = (status: EventStatus | null): SendStatus => {
  if (status === EventStatus.SENDING || status === EventStatus.QUEUED) return 'sending';
  if (status === EventStatus.NOT_SENT || status === EventStatus.CANCELLED) return 'failed';
  return 'sent';
};

type RelatesTo = { 'm.in_reply_to'?: { event_id?: unknown } };

const replyTargetOf = (event: MatrixEvent): string | undefined => {
  const relates = event.getContent()['m.relates_to'] as RelatesTo | undefined;
  const target = relates?.['m.in_reply_to']?.event_id;
  return typeof target === 'string' ? target : undefined;
};

const previewText = (body: string): string => {
  const cleaned = body.replace(/\s+/g, ' ').trim();
  return cleaned.length <= 100 ? cleaned : `${cleaned.slice(0, 100).trimEnd()}…`;
};

const toItem = (
  roomId: string,
  event: MatrixEvent,
  latestEdit: ReadonlyMap<string, string>,
  reactions: readonly ReactionCountView[]
): TimelineItem => {
  const eventId = event.getId() ?? '';
  const base = {
    eventId,
    roomId,
    sender: event.getSender() ?? '',
    timestamp: event.getTs(),
  };
  if (event.isRedacted()) return { ...base, kind: 'redacted', preview: 'Message deleted' };

  const content = event.getContent<{ msgtype?: string; body?: string }>();
  if (event.getType() === 'm.room.encrypted') {
    return {
      ...base,
      kind: 'encrypted',
      preview: 'Unable to decrypt message',
      ...(content.msgtype === 'm.bad.encrypted' ? { failure: 'missing-keys' as const } : {}),
    };
  }

  const body = latestEdit.get(eventId) ?? content.body ?? '';
  const replyTo = replyTargetOf(event);
  const relation = event.getRelation();
  const threadRoot = relation?.rel_type === 'm.thread' ? relation.event_id : undefined;
  return {
    ...base,
    kind: 'message',
    preview: previewText(body),
    content: {
      msgtype: content.msgtype ?? 'm.text',
      body,
    },
    status: toSendStatus(event.status),
    ...(replyTo !== undefined ? { replyTo } : {}),
    ...(threadRoot !== undefined ? { threadRoot } : {}),
    ...(reactions.length > 0 ? { reactions } : {}),
  };
};

const toTimelineView = (
  roomId: string,
  events: readonly MatrixEvent[],
  room: Room | undefined
): TimelineView => {
  const latestEdit = new Map<string, string>();
  events.forEach((event) => {
    if (!isEdit(event)) return;
    const target = event.getRelation()?.event_id;
    const body = event.getContent<{ 'm.new_content'?: { body?: unknown } }>()['m.new_content']
      ?.body;
    if (target && typeof body === 'string') latestEdit.set(target, body);
  });

  const countsByTarget = new Map<string, Map<string, number>>();
  events.forEach((event) => {
    if (event.getType() !== 'm.reaction') return;
    const relates = event.getContent()['m.relates_to'] as
      | { event_id?: unknown; key?: unknown }
      | undefined;
    const target = relates?.event_id;
    const key = relates?.key;
    if (typeof target !== 'string' || typeof key !== 'string') return;
    const counts = countsByTarget.get(target) ?? new Map<string, number>();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    countsByTarget.set(target, counts);
  });

  const items = events
    .filter(
      (event) =>
        !isEdit(event) &&
        (event.getType() === 'm.room.message' || event.getType() === 'm.room.encrypted')
    )
    .map((event) => {
      const counts = countsByTarget.get(event.getId() ?? '') ?? new Map<string, number>();
      const reactions = [...counts].map(([key, count]) => ({ key, count }));
      const item = toItem(roomId, event, latestEdit, reactions);
      const readers = room
        ? room
            .getUsersReadUpTo(event)
            .filter((userId) => userId !== room.myUserId && userId !== event.getSender())
        : [];
      return item.kind === 'message' && readers.length > 0 ? { ...item, readBy: readers } : item;
    });

  const hasBackwardHistory =
    room?.getLiveTimeline().getPaginationToken(EventTimeline.BACKWARDS) != null;
  const ownReadUpTo = room?.getEventReadUpTo(room.myUserId) ?? undefined;
  return {
    roomId,
    items,
    hasBackwardHistory,
    ...(ownReadUpTo !== null && ownReadUpTo !== undefined ? { readUpTo: ownReadUpTo } : {}),
  };
};

export function createMatrixJsCore(client: MatrixClient): HarrierCore {
  const joined = () => {
    const direct = directRoomIds(client);
    return client
      .getRooms()
      .filter((room) => room.getMyMembership() === 'join')
      .map((room) => toSummary(room, direct, client))
      .filter((summary): summary is RoomSummaryView => summary !== null);
  };

  const roomsStore = createSnapshotStore<readonly RoomSummaryView[]>(joined());
  const refresh = () => roomsStore.publish(joined());
  client.on(ClientEvent.Room, refresh);
  client.on(RoomEvent.MyMembership, refresh);
  client.on(ClientEvent.AccountData, refresh);

  const timelines = new Map<string, WritableSnapshotStore<TimelineView>>();
  const buildTimeline = (roomId: string) => {
    const room = client.getRoom(roomId) ?? undefined;
    return toTimelineView(roomId, room?.getLiveTimeline().getEvents() ?? [], room);
  };
  const republish = (_event: MatrixEvent, room: Room | undefined) => {
    if (!room) return;
    timelines.get(room.roomId)?.publish(buildTimeline(room.roomId));
  };
  client.on(RoomEvent.Timeline, republish);
  client.on(RoomEvent.Receipt, republish);

  const presenceStores = new Map<string, WritableSnapshotStore<PresenceView | null>>();
  const buildPresence = (userId: string): PresenceView | null => {
    const user = client.getUser(userId);
    if (!user) return null;
    const status =
      user.presence === 'online' || user.presence === 'unavailable' ? user.presence : 'offline';
    return { userId, status };
  };
  client.on(UserEvent.Presence, (_event: MatrixEvent | undefined, user: User) => {
    presenceStores.get(user.userId)?.publish(buildPresence(user.userId));
  });

  const typingStores = new Map<string, WritableSnapshotStore<readonly string[]>>();
  const buildTyping = (roomId: string): readonly string[] =>
    client
      .getRoom(roomId)
      ?.getMembers()
      .filter((member) => member.typing)
      .map((member) => member.userId) ?? [];
  client.on(RoomMemberEvent.Typing, (_event: MatrixEvent, member) => {
    typingStores.get(member.roomId)?.publish(buildTyping(member.roomId));
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
    presence: {
      presence(userId) {
        const existing = presenceStores.get(userId);
        if (existing) return existing;
        const store = createSnapshotStore(buildPresence(userId));
        presenceStores.set(userId, store);
        return store;
      },
      typing(roomId) {
        const existing = typingStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildTyping(roomId));
        typingStores.set(roomId, store);
        return store;
      },
    },
  };
}
