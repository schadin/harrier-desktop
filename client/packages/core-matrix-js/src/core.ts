import {
  createSnapshotStore,
  fillMissingPowers,
  toCoreError,
  type CoreResult,
  type HarrierCore,
  type IPowerLevels,
  type JsonObject,
  type MemberView,
  type Membership,
  type MessageAttachmentKind,
  type MessageAttachmentView,
  type NotificationMode,
  type PresenceView,
  type PublicRoomView,
  type PublicRoomsResult,
  type ReactionCountView,
  type RoomAccountDataEntry,
  type RoomStateEntry,
  type RoomSummaryView,
  type RoomView,
  type SendStatus,
  type UnreadCountView,
  type UnreadMapEntry,
  type SessionView,
  type SyncView,
  type TimelineItem,
  type TimelineView,
  type WritableSnapshotStore,
  readPowerLevel,
} from '@harrier/core';
import {
  ClientEvent,
  Direction,
  EventType,
  EventStatus,
  EventTimeline,
  MatrixClient,
  MatrixEvent,
  NotificationCountType,
  Room,
  RoomEvent,
  RoomMemberEvent,
  SetPresence,
  SyncState,
  User,
  UserEvent,
  Method,
  type ICreateRoomStateEvent,
} from 'matrix-js-sdk';

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

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const attachmentKind = (msgtype: string): MessageAttachmentKind | undefined => {
  switch (msgtype) {
    case 'm.image':
      return 'image';
    case 'm.video':
      return 'video';
    case 'm.audio':
      return 'audio';
    case 'm.file':
      return 'file';
    case 'm.location':
      return 'location';
    default:
      return undefined;
  }
};

const attachmentOf = (content: JsonObject): MessageAttachmentView | undefined => {
  const msgtype = stringOrUndefined(content.msgtype) ?? '';
  const kind = attachmentKind(msgtype);
  if (!kind) return undefined;
  const info = (content.info ?? {}) as JsonObject;
  const mxcUrl = stringOrUndefined(content.url);
  const filename =
    stringOrUndefined(content.filename) ??
    (kind === 'location' ? undefined : stringOrUndefined(content.body));
  const mimetype = stringOrUndefined(info.mimetype);
  const size = numberOrUndefined(info.size);
  const width = numberOrUndefined(info.w);
  const height = numberOrUndefined(info.h);
  const duration = numberOrUndefined(info.duration);
  const geoUri = stringOrUndefined(content.geo_uri);
  return {
    kind,
    ...(mxcUrl !== undefined ? { mxcUrl } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(mimetype !== undefined ? { mimetype } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(geoUri !== undefined ? { geoUri } : {}),
  };
};

type EditedMessage = {
  readonly body: string;
  readonly formattedBody?: string;
  readonly format?: string;
};

const viaServersOf = (room: Room): readonly string[] => {
  const serverOf = (userId: string) => {
    const separator = userId.indexOf(':');
    return separator > 0 ? userId.slice(separator + 1) : undefined;
  };
  const createEvent = room.currentState.getStateEvents('m.room.create', '');
  const creatorsSupported = (version: string) =>
    !['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].includes(version);
  let highestPowerUserId: string | undefined;
  if (
    createEvent &&
    creatorsSupported(createEvent.getContent<{ room_version?: string }>().room_version ?? '')
  ) {
    highestPowerUserId = createEvent.getSender();
  } else {
    const powerLevels = room.currentState
      .getStateEvents('m.room.power_levels', '')
      ?.getContent<{ users?: Record<string, number>; users_default?: number }>();
    const users = powerLevels?.users;
    if (users) {
      Object.keys(users).forEach((userId) => {
        if (users[userId] <= (powerLevels?.users_default ?? 0)) return;
        if (!highestPowerUserId || users[userId] > users[highestPowerUserId]) {
          highestPowerUserId = userId;
        }
      });
    }
  }

  const population = new Map<string, number>();
  room.getMembers().forEach((member) => {
    const server = serverOf(member.userId);
    if (server) population.set(server, (population.get(server) ?? 0) + 1);
  });
  const sorted = [...population].sort((a, b) => b[1] - a[1]).map(([server]) => server);
  const creatorServer = highestPowerUserId ? serverOf(highestPowerUserId) : undefined;
  if (!creatorServer) return sorted.slice(0, 3);
  return [creatorServer, ...sorted.filter((server) => server !== creatorServer).slice(0, 2)];
};

const dmUserIdOf = (room: Room): string => {
  const oldestMember = (members: ReturnType<Room['getMembers']>) => {
    let oldestTs: number | undefined;
    let oldestUserId: string | undefined;
    members.forEach((member) => {
      if (member.userId === room.myUserId) return;
      const ts = member.events.member?.getTs();
      if (oldestTs === undefined || (ts !== undefined && ts < oldestTs)) {
        oldestTs = ts;
        oldestUserId = member.userId;
      }
    });
    return oldestUserId;
  };

  return (
    oldestMember(room.getJoinedMembers()) ??
    oldestMember(room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getMembers() ?? []) ??
    room.myUserId
  );
};

const isReaction = (event: MatrixEvent): boolean => event.getType() === 'm.reaction';

const toItem = (
  roomId: string,
  event: MatrixEvent,
  latestEdit: ReadonlyMap<string, EditedMessage>,
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

  const eventType = event.getType();
  if (eventType === 'm.room.encrypted') {
    const content = event.getContent<{ msgtype?: string }>();
    return {
      ...base,
      kind: 'encrypted',
      preview: 'Unable to decrypt message',
      ...(content.msgtype === 'm.bad.encrypted' ? { failure: 'missing-keys' as const } : {}),
    };
  }

  if (eventType === 'm.sticker') {
    return {
      ...base,
      kind: 'sticker',
      preview: previewText(event.getContent<{ body?: string }>().body ?? ''),
      content: event.getContent() as JsonObject,
    };
  }

  if (typeof event.getStateKey() === 'string') {
    return {
      ...base,
      kind: 'state',
      eventType,
      stateKey: event.getStateKey() ?? '',
      preview: eventType,
      content: event.getContent() as JsonObject,
    };
  }

  if (eventType !== 'm.room.message') {
    return { ...base, kind: 'unsupported', eventType, preview: eventType };
  }

  const rawContent = event.getContent() as JsonObject;
  const content = event.getContent<{
    msgtype?: string;
    body?: string;
    formatted_body?: string;
    format?: string;
  }>();
  const edit = latestEdit.get(eventId);
  const body = edit?.body ?? content.body ?? '';
  const formattedBody = edit?.formattedBody ?? content.formatted_body;
  const format = edit?.format ?? content.format;
  const attachment = attachmentOf(rawContent);
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
      ...(formattedBody !== undefined && format !== undefined ? { formattedBody, format } : {}),
      ...(attachment !== undefined ? { attachment } : {}),
    },
    status: toSendStatus(event.status),
    ...(edit !== undefined ? { edited: true } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
    ...(threadRoot !== undefined ? { threadRoot } : {}),
    ...(reactions.length > 0 ? { reactions } : {}),
  };
};

const renderableEvents = (events: readonly MatrixEvent[]): MatrixEvent[] =>
  events.filter((event) => !isEdit(event) && !isReaction(event));

const toTimelineView = (
  roomId: string,
  events: readonly MatrixEvent[],
  room: Room | undefined,
  hasBackwardHistory: boolean,
  focusedEventId?: string
): TimelineView => {
  const latestEdit = new Map<string, EditedMessage>();
  events.forEach((event) => {
    if (!isEdit(event)) return;
    const target = event.getRelation()?.event_id;
    const newContent = event.getContent<{
      'm.new_content'?: { body?: unknown; formatted_body?: unknown; format?: unknown };
    }>()['m.new_content'];
    const body = newContent?.body;
    if (!target || typeof body !== 'string') return;
    latestEdit.set(target, {
      body,
      ...(typeof newContent?.formatted_body === 'string' && typeof newContent?.format === 'string'
        ? { formattedBody: newContent.formatted_body, format: newContent.format }
        : {}),
    });
  });

  const countsByTarget = new Map<string, Map<string, { senders: string[]; shortcode?: string }>>();
  events.forEach((event) => {
    if (event.getType() !== 'm.reaction') return;
    const content = event.getContent();
    const relates = content['m.relates_to'] as { event_id?: unknown; key?: unknown } | undefined;
    const target = relates?.event_id;
    const key = relates?.key;
    const sender = event.getSender();
    if (typeof target !== 'string' || typeof key !== 'string' || sender === null) return;
    const counts = countsByTarget.get(target) ?? new Map();
    const entry = counts.get(key) ?? { senders: [] };
    if (!entry.senders.includes(sender)) entry.senders.push(sender);
    const shortcode = stringOrUndefined(content.shortcode);
    if (entry.shortcode === undefined && shortcode !== undefined) entry.shortcode = shortcode;
    counts.set(key, entry);
    countsByTarget.set(target, counts);
  });

  const items = renderableEvents(events).map((event) => {
    const counts = countsByTarget.get(event.getId() ?? '') ?? new Map();
    const reactions = [...counts].map(([key, { senders, shortcode }]) => ({
      key,
      count: senders.length,
      senders,
      ...(shortcode !== undefined ? { shortcode } : {}),
    }));
    const item = toItem(roomId, event, latestEdit, reactions);
    const readers = room
      ? room
          .getUsersReadUpTo(event)
          .filter((userId) => userId !== room.myUserId && userId !== event.getSender())
      : [];
    return item.kind === 'message' && readers.length > 0 ? { ...item, readBy: readers } : item;
  });

  const ownReadUpTo = room?.getEventReadUpTo(room.myUserId) ?? undefined;
  return {
    roomId,
    items,
    hasBackwardHistory,
    ...(ownReadUpTo !== null && ownReadUpTo !== undefined ? { readUpTo: ownReadUpTo } : {}),
    ...(focusedEventId !== undefined ? { focusedEventId } : {}),
  };
};

const firstLinkedTimeline = (timeline: EventTimeline): EventTimeline => {
  let first = timeline;
  let previous = first.getNeighbouringTimeline(Direction.Backward);
  while (previous) {
    first = previous;
    previous = first.getNeighbouringTimeline(Direction.Backward);
  }
  return first;
};

const lastLinkedTimeline = (timeline: EventTimeline): EventTimeline => {
  let last = timeline;
  let next = last.getNeighbouringTimeline(Direction.Forward);
  while (next) {
    last = next;
    next = last.getNeighbouringTimeline(Direction.Forward);
  }
  return last;
};

const collectLinkedEvents = (timeline: EventTimeline): MatrixEvent[] => {
  const events: MatrixEvent[] = [];
  for (
    let current: EventTimeline | null = firstLinkedTimeline(timeline);
    current;
    current = current.getNeighbouringTimeline(Direction.Forward)
  ) {
    events.push(...current.getEvents());
  }
  return events;
};

const spaceChildrenOf = (room: Room | null | undefined): readonly string[] =>
  (room?.currentState.getStateEvents('m.space.child') ?? [])
    .filter((event) => Array.isArray(event.getContent<{ via?: unknown }>().via))
    .map((event) => event.getStateKey())
    .filter((childId): childId is string => typeof childId === 'string' && childId.length > 0);

const NOTIFICATION_EVENT_TYPES = [
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.sticker',
];

const isNotificationEvent = (event: MatrixEvent): boolean => {
  if (!NOTIFICATION_EVENT_TYPES.includes(event.getType())) return false;
  if (event.getType() === 'm.room.member') return false;
  if (event.isRedacted()) return false;
  if (event.getRelation()?.rel_type === 'm.replace') return false;
  return true;
};

const arrayEqual = (
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined
): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((item, index) => item === b[index]));

const roomViewEqual = (a: RoomView | null, b: RoomView | null): boolean => {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  return (
    a.roomId === b.roomId &&
    a.name === b.name &&
    a.membership === b.membership &&
    a.isDirect === b.isDirect &&
    a.isSpace === b.isSpace &&
    a.unread?.total === b.unread?.total &&
    a.unread?.highlight === b.unread?.highlight &&
    a.notificationMode === b.notificationMode &&
    a.topic === b.topic &&
    a.encrypted === b.encrypted &&
    a.joinRule === b.joinRule &&
    JSON.stringify(a.joinRuleContent) === JSON.stringify(b.joinRuleContent) &&
    a.roomType === b.roomType &&
    a.canonicalAlias === b.canonicalAlias &&
    a.dmUserId === b.dmUserId &&
    a.avatarMxc === b.avatarMxc &&
    a.dmAvatarMxc === b.dmAvatarMxc &&
    arrayEqual(a.viaServers, b.viaServers) &&
    arrayEqual(a.spaceChildren, b.spaceChildren)
  );
};

const memberListEqual = (
  a: readonly MemberView[] | undefined,
  b: readonly MemberView[] | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (member, index) =>
      member.userId === b[index]?.userId &&
      member.displayName === b[index]?.displayName &&
      member.rawDisplayName === b[index]?.rawDisplayName &&
      member.membership === b[index]?.membership &&
      member.avatarMxc === b[index]?.avatarMxc &&
      member.powerLevel === b[index]?.powerLevel &&
      member.joinedAt === b[index]?.joinedAt &&
      member.leftBySelf === b[index]?.leftBySelf
  );
};

const toPublicRoomView = (room: Record<string, unknown>): PublicRoomView => ({
  roomId: typeof room.room_id === 'string' ? room.room_id : '',
  name: typeof room.name === 'string' ? room.name : undefined,
  topic: typeof room.topic === 'string' ? room.topic : undefined,
  avatarMxc: typeof room.avatar_url === 'string' ? room.avatar_url : undefined,
  canonicalAlias: typeof room.canonical_alias === 'string' ? room.canonical_alias : undefined,
  joinRule: typeof room.join_rule === 'string' ? room.join_rule : undefined,
  roomType: typeof room.room_type === 'string' ? room.room_type : undefined,
  joinedMembers: typeof room.num_joined_members === 'number' ? room.num_joined_members : 0,
  worldReadable: room.world_readable === true,
  guestCanJoin: room.guest_can_join === true,
});

const unreadCountOf = (room: Room) => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
  return { total: highlight > total ? highlight : total, highlight };
};

const isUnreadRoom = (room: Room): boolean => {
  const { total, highlight } = unreadCountOf(room);
  if (total > 0 || highlight > 0) return true;
  const liveEvents = room.getLiveTimeline().getEvents();
  if (liveEvents.length === 0) return false;
  const userId = room.myUserId;
  const readUpTo = room.getEventReadUpTo(userId);
  if (liveEvents[liveEvents.length - 1]?.getSender() === userId) return false;
  for (let index = liveEvents.length - 1; index >= 0; index -= 1) {
    const event = liveEvents[index];
    if (!event) return false;
    if (event.getId() === readUpTo) return false;
    if (isNotificationEvent(event)) return true;
  }
  return true;
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

  const allRooms = () => {
    const direct = directRoomIds(client);
    return client
      .getRooms()
      .map((room) => toSummary(room, direct, client))
      .filter((summary): summary is RoomSummaryView => summary !== null);
  };

  const buildUnreads = (): readonly UnreadMapEntry[] => {
    const parentChildren = new Map<string, string[]>();
    allRooms()
      .filter((room) => room.isSpace)
      .forEach((room) => {
        parentChildren.set(room.roomId, [...spaceChildrenOf(client.getRoom(room.roomId))]);
      });

    const allParentsOf = (roomId: string, seen = new Set<string>()): Set<string> => {
      const parents = new Set<string>();
      parentChildren.forEach((children, parentId) => {
        if (!children.includes(roomId) || seen.has(parentId)) return;
        seen.add(parentId);
        parents.add(parentId);
        allParentsOf(parentId, seen).forEach((id) => parents.add(id));
      });
      return parents;
    };

    const unreads = new Map<string, UnreadCountView>();
    client.getRooms().forEach((room) => {
      if (room.isSpaceRoom()) return;
      if (room.getMyMembership() !== 'join') return;
      if (notificationModeOf(client, room.roomId) === 'mute') return;
      if (!isUnreadRoom(room)) return;
      const unread = unreadCountOf(room);
      unreads.set(room.roomId, unread);
      allParentsOf(room.roomId).forEach((parentId) => {
        const parent = unreads.get(parentId) ?? { total: 0, highlight: 0 };
        unreads.set(parentId, {
          total: parent.total + unread.total,
          highlight: parent.highlight + unread.highlight,
        });
      });
    });

    return [...unreads].map(([roomId, unread]) => ({ roomId, unread }));
  };

  const buildRoomView = (roomId: string): RoomView | null => {
    const room = client.getRoom(roomId);
    if (!room) return null;
    const summary = toSummary(room, directRoomIds(client), client);
    if (!summary) return null;
    const topic = room.currentState
      .getStateEvents('m.room.topic', '')
      ?.getContent<{ topic?: string }>().topic;
    const encrypted = room.currentState.getStateEvents('m.room.encryption', '') !== null;
    const avatarMxc = room.currentState
      .getStateEvents('m.room.avatar', '')
      ?.getContent<{ url?: string }>().url;
    const dmAvatarMxc = room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? undefined;
    return {
      ...summary,
      topic,
      encrypted,
      joinRule: room.getJoinRule(),
      joinRuleContent: room.currentState.getStateEvents('m.room.join_rules', '')?.getContent() as
        | JsonObject
        | undefined,
      roomType: room.getType(),
      canonicalAlias: room.getCanonicalAlias() ?? undefined,
      dmUserId: dmUserIdOf(room),
      avatarMxc,
      dmAvatarMxc,
      viaServers: viaServersOf(room),
      spaceChildren: (room.currentState.getStateEvents('m.space.child') ?? [])
        .filter((event) => Array.isArray(event.getContent<{ via?: unknown }>().via))
        .map((event) => event.getStateKey())
        .filter((childId): childId is string => typeof childId === 'string' && childId.length > 0),
    };
  };

  const buildPowerLevels = (roomId: string): IPowerLevels => {
    const content = client
      .getRoom(roomId)
      ?.currentState.getStateEvents('m.room.power_levels', '')
      ?.getContent();
    return fillMissingPowers({ ...(content ?? {}) } as IPowerLevels);
  };

  const buildMembers = (roomId: string): readonly MemberView[] => {
    const room = client.getRoom(roomId);
    if (!room) return [];
    const powerLevels = buildPowerLevels(roomId);
    return room.getMembers().map((member) => ({
      userId: member.userId,
      displayName: member.name,
      rawDisplayName: member.rawDisplayName,
      membership: toMembership(member.membership) ?? 'leave',
      avatarMxc: member.getMxcAvatarUrl(),
      powerLevel: readPowerLevel.user(powerLevels, member.userId),
      joinedAt: member.events.member?.getTs(),
      leftBySelf: member.events.member?.getStateKey() === member.events.member?.getSender(),
    }));
  };

  const CREATORS_UNSUPPORTED_VERSIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
  const buildCreators = (roomId: string): readonly string[] => {
    const createEvent = client.getRoom(roomId)?.currentState.getStateEvents('m.room.create', '');
    if (!createEvent) return [];
    const content = createEvent.getContent<{
      room_version?: string;
      additional_creators?: unknown;
    }>();
    if (CREATORS_UNSUPPORTED_VERSIONS.includes(content.room_version ?? '')) return [];
    const creators = new Set<string>();
    const sender = createEvent.getSender();
    if (sender) creators.add(sender);
    if (Array.isArray(content.additional_creators)) {
      content.additional_creators.forEach((creator) => {
        if (typeof creator === 'string') creators.add(creator);
      });
    }
    return [...creators];
  };

  const buildAccountData = (roomId: string): readonly RoomAccountDataEntry[] => {
    const room = client.getRoom(roomId);
    if (!room) return [];
    return Array.from(room.accountData.entries()).map(([type, event]) => ({
      type,
      content: event.getContent() as JsonObject,
    }));
  };

  const stateStores = new Map<string, WritableSnapshotStore<JsonObject | null>>();
  const stateKeyOf = (roomId: string, eventType: string, key: string) =>
    `${roomId}|${eventType}|${key}`;
  const buildState = (roomId: string, eventType: string, key: string): JsonObject | null => {
    const event = client.getRoom(roomId)?.currentState.getStateEvents(eventType, key);
    return event ? (event.getContent() as JsonObject) : null;
  };
  const publishState = (roomId: string, eventType: string, key: string) => {
    const store = stateStores.get(stateKeyOf(roomId, eventType, key));
    if (!store) return;
    const next = buildState(roomId, eventType, key);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };

  const stateListStores = new Map<string, WritableSnapshotStore<readonly RoomStateEntry[]>>();
  const stateListKeyOf = (roomId: string, eventType: string) => `${roomId}|${eventType}`;
  const buildStateList = (roomId: string, eventType: string): readonly RoomStateEntry[] => {
    const events = client.getRoom(roomId)?.currentState.getStateEvents(eventType) ?? [];
    return events.map((event) => ({
      stateKey: event.getStateKey() ?? '',
      content: event.getContent() as JsonObject,
      eventId: event.getId() ?? undefined,
    }));
  };
  const publishStateList = (roomId: string, eventType: string) => {
    const store = stateListStores.get(stateListKeyOf(roomId, eventType));
    if (!store) return;
    const next = buildStateList(roomId, eventType);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };

  const buildRoomToParents = (): Map<string, readonly string[]> => {
    const roomToParents = new Map<string, readonly string[]>();
    const getAllParents = (roomId: string): Set<string> => {
      const allParents = new Set<string>();
      const addAllParentIds = (id: string) => {
        if (allParents.has(id)) return;
        allParents.add(id);
        roomToParents.get(id)?.forEach((parentId) => addAllParentIds(parentId));
      };
      addAllParentIds(roomId);
      allParents.delete(roomId);
      return allParents;
    };

    client.getRooms().forEach((room) => {
      if (!room.isSpaceRoom()) return;
      const membership = toMembership(room.getMyMembership());
      if (!membership || membership === 'invite') return;
      const allParents = getAllParents(room.roomId);
      spaceChildrenOf(room).forEach((childId) => {
        if (allParents.has(childId)) return;
        roomToParents.set(childId, [...(roomToParents.get(childId) ?? []), room.roomId]);
      });
    });
    return roomToParents;
  };
  let roomToParentsCache: Map<string, readonly string[]> | undefined;
  const roomToParentsMap = () => {
    if (!roomToParentsCache) roomToParentsCache = buildRoomToParents();
    return roomToParentsCache;
  };
  const buildParents = (roomId: string): readonly string[] => roomToParentsMap().get(roomId) ?? [];

  const allRoomsStore = createSnapshotStore<readonly RoomSummaryView[]>(allRooms());
  const roomsStore = createSnapshotStore<readonly RoomSummaryView[]>(joined());
  const unreadsStore = createSnapshotStore<readonly UnreadMapEntry[]>(buildUnreads());
  const roomStores = new Map<string, WritableSnapshotStore<RoomView | null>>();
  const memberStores = new Map<string, WritableSnapshotStore<readonly MemberView[]>>();
  const powerLevelsStores = new Map<string, WritableSnapshotStore<IPowerLevels>>();
  const creatorStores = new Map<string, WritableSnapshotStore<readonly string[]>>();
  const accountDataStores = new Map<
    string,
    WritableSnapshotStore<readonly RoomAccountDataEntry[]>
  >();
  const accountDataListeners = new Map<
    string,
    { room: Room; listener: (event: MatrixEvent) => void }
  >();
  const parentsStores = new Map<string, WritableSnapshotStore<readonly string[]>>();
  const publishParents = (roomId: string) => {
    const store = parentsStores.get(roomId);
    if (!store) return;
    const next = buildParents(roomId);
    if (arrayEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishAccountData = (roomId: string) => {
    const store = accountDataStores.get(roomId);
    if (!store) return;
    const next = buildAccountData(roomId);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };
  const ensureAccountDataListener = (roomId: string) => {
    const tracked = accountDataListeners.get(roomId);
    const room = client.getRoom(roomId);
    if (tracked) {
      if (!room || tracked.room === room) return;
      tracked.room.removeListener(RoomEvent.AccountData, tracked.listener);
      accountDataListeners.delete(roomId);
    }
    if (!room) return;
    const listener = (event: MatrixEvent) => {
      if (event.getRoomId() === roomId) publishAccountData(roomId);
    };
    room.on(RoomEvent.AccountData, listener);
    accountDataListeners.set(roomId, { room, listener });
  };
  const publishRoomView = (roomId: string) => {
    const store = roomStores.get(roomId);
    if (!store) return;
    const next = buildRoomView(roomId);
    if (roomViewEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishMembers = (roomId: string) => {
    const store = memberStores.get(roomId);
    if (!store) return;
    const next = buildMembers(roomId);
    if (memberListEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishPowerLevels = (roomId: string) => {
    const store = powerLevelsStores.get(roomId);
    if (!store) return;
    const next = buildPowerLevels(roomId);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishCreators = (roomId: string) => {
    const store = creatorStores.get(roomId);
    if (!store) return;
    const next = buildCreators(roomId);
    if (arrayEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishRoomProjections = (roomId: string) => {
    publishRoomView(roomId);
    publishMembers(roomId);
    publishPowerLevels(roomId);
    publishCreators(roomId);
  };
  const refresh = () => {
    roomToParentsCache = undefined;
    allRoomsStore.publish(allRooms());
    roomsStore.publish(joined());
    unreadsStore.publish(buildUnreads());
    roomStores.forEach((_store, roomId) => publishRoomView(roomId));
    memberStores.forEach((_store, roomId) => publishMembers(roomId));
    powerLevelsStores.forEach((_store, roomId) => publishPowerLevels(roomId));
    creatorStores.forEach((_store, roomId) => publishCreators(roomId));
    accountDataStores.forEach((_store, roomId) => {
      ensureAccountDataListener(roomId);
      publishAccountData(roomId);
    });
    parentsStores.forEach((_store, roomId) => publishParents(roomId));
    stateStores.forEach((_store, key) => {
      const [roomId, eventType, stateKey] = key.split('|');
      if (roomId && eventType && stateKey !== undefined) publishState(roomId, eventType, stateKey);
    });
    stateListStores.forEach((_store, key) => {
      const [roomId, eventType] = key.split('|');
      if (roomId && eventType) publishStateList(roomId, eventType);
    });
  };
  client.on(ClientEvent.Room, refresh);
  client.on(RoomEvent.MyMembership, refresh);
  client.on(ClientEvent.AccountData, refresh);

  const timelines = new Map<string, WritableSnapshotStore<TimelineView>>();
  const focusedTimelines = new Map<string, { timeline: EventTimeline; eventId: string }>();
  const buildTimeline = (roomId: string) => {
    const room = client.getRoom(roomId) ?? undefined;
    const focus = focusedTimelines.get(roomId);
    const anchor = focus?.timeline ?? room?.getLiveTimeline();
    const events = anchor ? collectLinkedEvents(anchor) : [];
    const hasBackwardHistory = anchor
      ? firstLinkedTimeline(anchor).getPaginationToken(EventTimeline.BACKWARDS) != null
      : false;
    return toTimelineView(roomId, events, room, hasBackwardHistory, focus?.eventId);
  };
  const republish = (_event: MatrixEvent, room: Room | undefined) => {
    refresh();
    if (!room) return;
    publishRoomProjections(room.roomId);
    timelines.get(room.roomId)?.publish(buildTimeline(room.roomId));
  };
  client.on(RoomEvent.Timeline, republish);
  client.on(RoomEvent.Receipt, republish);
  client.on(RoomEvent.LocalEchoUpdated, republish);

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

  const sessionStore = createSnapshotStore<SessionView | null>({
    userId: client.getSafeUserId(),
    deviceId: client.getDeviceId() ?? '',
    ready: false,
  });

  const syncStore = createSnapshotStore<SyncView>({ phase: 'idle' });

  client.on(ClientEvent.Sync, (state: SyncState) => {
    let phase: SyncView['phase'] = 'syncing';
    if (state === SyncState.Prepared) phase = 'prepared';
    if (state === SyncState.Error) phase = 'error';
    syncStore.publish({ phase });
    if (state === SyncState.Prepared) {
      const session = sessionStore.getSnapshot().value;
      if (session) sessionStore.publish({ ...session, ready: true });
    }
  });

  return {
    capabilities: { calls: false, threads: false },
    auth: {
      session: sessionStore,
      sync: syncStore,
      async start(): Promise<CoreResult<void>> {
        try {
          syncStore.publish({ phase: 'syncing' });
          client.setSyncPresence(SetPresence.Online);
          await client.startClient({ lazyLoadMembers: true });
          return { ok: true, value: undefined };
        } catch (error) {
          syncStore.publish({ phase: 'error', error: toCoreError(error).message });
          return { ok: false, error: toCoreError(error) };
        }
      },
      async stop() {
        client.stopClient();
        syncStore.publish({ phase: 'stopped' });
      },
      async logout(): Promise<CoreResult<void>> {
        client.stopClient();
        try {
          await client.logout();
        } catch {
          // Local cleanup continues even if the server logout fails.
        }
        await client.clearStores();
        sessionStore.publish(null);
        syncStore.publish({ phase: 'stopped' });
        return { ok: true, value: undefined };
      },
    },
    rooms: {
      all: allRoomsStore,
      list: roomsStore,
      unreads: unreadsStore,
      room(roomId) {
        const existing = roomStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildRoomView(roomId));
        roomStores.set(roomId, store);
        return store;
      },
      members(roomId) {
        const existing = memberStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildMembers(roomId));
        memberStores.set(roomId, store);
        client
          .getRoom(roomId)
          ?.loadMembersIfNeeded()
          .then(() => publishMembers(roomId))
          .catch(() => undefined);
        return store;
      },
      powerLevels(roomId) {
        const existing = powerLevelsStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildPowerLevels(roomId));
        powerLevelsStores.set(roomId, store);
        return store;
      },
      creators(roomId) {
        const existing = creatorStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildCreators(roomId));
        creatorStores.set(roomId, store);
        return store;
      },
      accountData(roomId) {
        const existing = accountDataStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildAccountData(roomId));
        accountDataStores.set(roomId, store);
        ensureAccountDataListener(roomId);
        return store;
      },
      async setAccountData(roomId, type, content): Promise<CoreResult<void>> {
        try {
          await client.setRoomAccountData(roomId, type as never, content as never);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      parents(roomId) {
        const existing = parentsStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildParents(roomId));
        parentsStores.set(roomId, store);
        return store;
      },
      state(roomId, eventType, stateKey = '') {
        const key = stateKeyOf(roomId, eventType, stateKey);
        const existing = stateStores.get(key);
        if (existing) return existing;
        const store = createSnapshotStore(buildState(roomId, eventType, stateKey));
        stateStores.set(key, store);
        return store;
      },
      stateList(roomId, eventType) {
        const key = stateListKeyOf(roomId, eventType);
        const existing = stateListStores.get(key);
        if (existing) return existing;
        const store = createSnapshotStore(buildStateList(roomId, eventType));
        stateListStores.set(key, store);
        return store;
      },
      async sendState(roomId, eventType, content, stateKey = ''): Promise<CoreResult<void>> {
        try {
          await client.sendStateEvent(roomId, eventType as never, content as never, stateKey);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async join(roomIdOrAlias, viaServers): Promise<CoreResult<string>> {
        try {
          const result: unknown = await client.joinRoom(roomIdOrAlias, {
            viaServers: viaServers ? [...viaServers] : undefined,
          });
          const response = result as { roomId?: unknown; room_id?: unknown };
          let roomId = roomIdOrAlias;
          if (typeof response.roomId === 'string') roomId = response.roomId;
          else if (typeof response.room_id === 'string') roomId = response.room_id;
          return { ok: true, value: roomId };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async leave(roomId): Promise<CoreResult<void>> {
        try {
          await client.leave(roomId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async invite(roomId, userId, reason): Promise<CoreResult<void>> {
        try {
          await client.invite(roomId, userId, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async createRoom(params): Promise<CoreResult<string>> {
        const initialState: ICreateRoomStateEvent[] = [];

        if (params.encryption) {
          initialState.push({
            type: 'm.room.encryption',
            state_key: '',
            content: { algorithm: 'm.megolm.v1.aes-sha2' },
          });
        }

        if (params.parent) {
          initialState.push({
            type: 'm.space.parent',
            state_key: params.parent.roomId,
            content: { canonical: true, via: [...params.parent.via] },
          });
        }

        if (params.type === 'org.matrix.msc3417.call') {
          initialState.push({
            type: 'org.matrix.msc3401.call',
            state_key: '',
            content: {},
          });
        }

        let joinRuleContent: Record<string, unknown>;
        if (params.access === 'public') {
          joinRuleContent = { join_rule: 'public' };
        } else if (params.access === 'restricted' && params.parent) {
          joinRuleContent = {
            join_rule: params.knock ? 'knock_restricted' : 'restricted',
            allow: [{ type: 'm.room_membership', room_id: params.parent.roomId }],
          };
        } else {
          joinRuleContent = { join_rule: params.knock ? 'knock' : 'invite' };
        }
        initialState.push({ type: 'm.room.join_rules', state_key: '', content: joinRuleContent });

        const creationContent: Record<string, unknown> = {};
        if (typeof params.type === 'string') creationContent.type = params.type;
        if (params.allowFederation === false) creationContent['m.federate'] = false;
        if (params.additionalCreators) {
          creationContent.additional_creators = [...params.additionalCreators];
        }

        let powerLevelContentOverride: Record<string, unknown> | undefined;
        if (params.type === 'org.matrix.msc3417.call') {
          powerLevelContentOverride = { events: { 'org.matrix.msc3401.call.member': 0 } };
        }
        if (params.type === 'm.space') {
          powerLevelContentOverride = { events_default: 50 };
        }

        try {
          const result = await client.createRoom({
            room_version: params.version,
            name: params.name,
            topic: params.topic,
            room_alias_name: params.aliasLocalPart,
            creation_content: creationContent,
            power_level_content_override: powerLevelContentOverride,
            initial_state: initialState,
          });

          if (params.parent) {
            const userId = client.getUserId() ?? '';
            const ownServer = userId.slice(userId.indexOf(':') + 1);
            await client.sendStateEvent(
              params.parent.roomId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- m.space.child missing in SDK StateEvents map
              'm.space.child' as any,
              { auto_join: false, suggested: false, via: [ownServer] },
              result.room_id
            );
          }

          return { ok: true, value: result.room_id };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async upgrade(roomId, params): Promise<CoreResult<string>> {
        try {
          const response = await client.http.authedRequest<{ replacement_room?: string }>(
            Method.Post,
            `/rooms/${roomId}/upgrade`,
            undefined,
            {
              new_version: params.newVersion,
              additional_creators: params.additionalCreators
                ? [...params.additionalCreators]
                : undefined,
            }
          );
          return { ok: true, value: response.replacement_room ?? '' };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async searchDirectory(params): Promise<CoreResult<PublicRoomsResult>> {
        try {
          const response = await client.http.authedRequest<{
            chunk?: Array<Record<string, unknown>>;
            next_batch?: string;
          }>(
            Method.Post,
            '/publicRooms',
            { server: params.server },
            {
              limit: params.limit,
              since: params.since,
              filter: {
                generic_search_term: params.searchTerm,
                room_types: params.roomTypes ? [...params.roomTypes] : undefined,
              },
              third_party_instance_id: params.thirdPartyInstanceId,
            }
          );
          return {
            ok: true,
            value: {
              rooms: (response.chunk ?? []).map((room) => toPublicRoomView(room)),
              ...(typeof response.next_batch === 'string'
                ? { nextBatch: response.next_batch }
                : {}),
            },
          };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async hierarchy(roomId, params): Promise<CoreResult<PublicRoomsResult>> {
        try {
          const response = await client.getRoomHierarchy(
            roomId,
            params.limit,
            params.maxDepth ?? 1,
            params.suggestedOnly ?? false,
            params.from
          );
          return {
            ok: true,
            value: {
              rooms: (response.rooms ?? []).map((room) =>
                toPublicRoomView(room as unknown as Record<string, unknown>)
              ),
              ...(typeof response.next_batch === 'string'
                ? { nextBatch: response.next_batch }
                : {}),
            },
          };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
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
      async paginateBackward(roomId, limit): Promise<CoreResult<void>> {
        const room = client.getRoom(roomId);
        if (!room) return { ok: false, error: toCoreError(new Error(`Unknown room ${roomId}`)) };
        try {
          const anchor = focusedTimelines.get(roomId)?.timeline ?? room.getLiveTimeline();
          await client.paginateEventTimeline(firstLinkedTimeline(anchor), {
            backwards: true,
            limit,
          });
          timelines.get(roomId)?.publish(buildTimeline(roomId));
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async paginateForward(roomId, limit): Promise<CoreResult<void>> {
        const room = client.getRoom(roomId);
        if (!room) return { ok: false, error: toCoreError(new Error(`Unknown room ${roomId}`)) };
        try {
          const anchor = focusedTimelines.get(roomId)?.timeline ?? room.getLiveTimeline();
          const last = lastLinkedTimeline(anchor);
          if (last.getPaginationToken(EventTimeline.FORWARDS) != null) {
            await client.paginateEventTimeline(last, { backwards: false, limit });
            timelines.get(roomId)?.publish(buildTimeline(roomId));
          }
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      async focusEvent(roomId, eventId): Promise<CoreResult<number>> {
        const room = client.getRoom(roomId);
        if (!room) return { ok: false, error: toCoreError(new Error(`Unknown room ${roomId}`)) };
        try {
          const timeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
          if (!timeline) {
            return {
              ok: false,
              error: toCoreError(new Error(`Event ${eventId} not found in ${roomId}`)),
            };
          }
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const renderable = renderableEvents(collectLinkedEvents(timeline));
            const index = renderable.findIndex((event) => event.getId() === eventId);
            if (index >= 0) {
              focusedTimelines.set(roomId, { timeline, eventId });
              timelines.get(roomId)?.publish(buildTimeline(roomId));
              return { ok: true, value: index };
            }
            const first = firstLinkedTimeline(timeline);
            if (first.getPaginationToken(EventTimeline.BACKWARDS) == null) break;
            // eslint-disable-next-line no-await-in-loop -- sequential pagination until the event is loaded
            await client.paginateEventTimeline(first, { backwards: true, limit: 30 });
          }
          return {
            ok: false,
            error: toCoreError(new Error(`Event ${eventId} not found in ${roomId}`)),
          };
        } catch (error) {
          return { ok: false, error: toCoreError(error) };
        }
      },
      clearFocus(roomId) {
        if (focusedTimelines.delete(roomId)) timelines.get(roomId)?.publish(buildTimeline(roomId));
      },
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
