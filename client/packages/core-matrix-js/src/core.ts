import {
  CoreError,
  createSnapshotStore,
  fillMissingPowers,
  type CoreResult,
  type DeviceTrust,
  type DeviceView,
  type FederatedRoomSummaryView,
  type HarrierCore,
  type IPowerLevels,
  type JsonObject,
  type JsonValue,
  type MemberView,
  type Membership,
  type MessageAttachmentKind,
  type MessageAttachmentView,
  type MatrixEventView,
  type TimelineEventSourceView,
  type TimelineRelationView,
  type TimelineSourceView,
  type ReactionEventView,
  type DecryptionFailureCode,
  type DecryptionFailureReason,
  type NotificationMode,
  type NotificationView,
  type NotificationPreferencesView,
  type RoomNotificationModeView,
  type MediaConfigView,
  type MessageSearchContextView,
  type MessageSearchEventView,
  type PresenceView,
  type PublicRoomView,
  type PublicRoomsResult,
  type ReactionCountView,
  type RoomAccountDataEntry,
  type RoomStateEntry,
  type RoomSummaryView,
  type RoomView,
  type SendStatus,
  type SendStatusView,
  type ThirdPartyFieldTypeView,
  type ThirdPartyInstanceView,
  type ThirdPartyProtocolView,
  type UploadView,
  type UserId,
  type UserProfileView,
  type VerificationPhaseView,
  type VerificationRequestView,
  type BackupProgressView,
  type BackupStatusView,
  type CapabilitiesView,
  type AuthMetadataView,
  type ThreepidView,
  type CallView,
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
  HttpApiEvent,
  EventType,
  EventStatus,
  EventTimeline,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  NotificationCountType,
  Room,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SetPresence,
  SyncState,
  User,
  UserEvent,
  Method,
  ReceiptType,
  ConditionKind,
  PushRuleKind,
  type ICreateRoomStateEvent,
  type UploadResponse,
  type EventTimelineSet,
} from 'matrix-js-sdk';
import {
  CryptoEvent,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  ImportRoomKeyStage,
  type ImportRoomKeyProgressData,
  decodeRecoveryKey,
  deriveRecoveryKeyFromPassphrase,
  type ShowSasCallbacks,
  type CryptoApi,
  type VerificationRequest,
  type Verifier,
} from 'matrix-js-sdk/lib/crypto-api';
import { VerificationMethod } from 'matrix-js-sdk/lib/types';
import {
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { decryptAttachment } from 'browser-encrypt-attachment';
import { registerMatrixClient } from './legacy';
import { normalizeMatrixError } from './error';
import {
  associateMatrixJsCoreSecretStorage,
  resolveMatrixJsSecretStorage,
  revokeMatrixJsSecretStorageCallbacks,
  type SecretStorageKeyStore,
} from './secretStorageKeys';

const MEMBERSHIPS: readonly Membership[] = ['join', 'invite', 'leave', 'ban', 'knock'];

const toMembership = (value: string | null | undefined): Membership | null =>
  MEMBERSHIPS.find((membership) => membership === value) ?? null;

const toUserProfileView = (user: User): UserProfileView => ({
  userId: user.userId,
  ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  ...(user.displayName ? { displayName: user.displayName } : {}),
});

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
  const roomType = room.getType();
  return {
    roomId: room.roomId,
    name: room.name,
    lastActiveTimestamp: room.getLastActiveTimestamp(),
    membership,
    isDirect: direct.has(room.roomId),
    isSpace: room.isSpaceRoom(),
    ...(roomType ? { roomType } : {}),
    ...(total > 0 || highlight > 0 ? { unread: { total, highlight } } : {}),
    notificationMode: notificationModeOf(client, room.roomId),
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const toPlainJson = (value: unknown, seen = new WeakSet<object>()): JsonValue | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object' || value === null || seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => toPlainJson(item, seen) ?? null);
    }
    if (!isPlainRecord(value)) return undefined;
    const result: JsonObject = {};
    Object.entries(value).forEach(([key, item]) => {
      const plain = toPlainJson(item, seen);
      if (plain === undefined) return;
      Object.defineProperty(result, key, {
        value: plain,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    });
    return result;
  } finally {
    seen.delete(value);
  }
};

const toPlainJsonObject = (value: unknown): JsonObject => {
  const plain = toPlainJson(value);
  return typeof plain === 'object' && plain !== null && !Array.isArray(plain) ? plain : {};
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

const isEdit = (event: MatrixEvent): boolean => event.getRelation()?.rel_type === 'm.replace';

const toSendStatus = (status: EventStatus | null): SendStatus => {
  if (status === EventStatus.SENDING || status === EventStatus.QUEUED) return 'sending';
  if (status === EventStatus.NOT_SENT || status === EventStatus.CANCELLED) return 'failed';
  return 'sent';
};

type RelatesTo = { 'm.in_reply_to'?: { event_id?: unknown } };

const replyTargetOf = (event: MatrixEvent): string | undefined => {
  const relates = event.getWireContent()['m.relates_to'] as RelatesTo | undefined;
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

const toThreepidViews = (value: unknown): readonly ThreepidView[] => {
  if (!Array.isArray(value)) return [];

  const views: ThreepidView[] = [];
  value.forEach((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return;
    const raw = item as Record<string, unknown>;
    if (raw.medium !== 'email' && raw.medium !== 'msisdn') return;
    if (typeof raw.address !== 'string' || raw.address.trim().length === 0) return;

    const validatedAt = numberOrUndefined(raw.validated_at);
    const addedAt = numberOrUndefined(raw.added_at);
    views.push({
      medium: raw.medium,
      address: raw.address,
      ...(validatedAt !== undefined ? { validatedAt } : {}),
      ...(addedAt !== undefined ? { addedAt } : {}),
      ...(typeof raw.bound === 'boolean' ? { bound: raw.bound } : {}),
    });
  });
  return views;
};

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

const isReaction = (event: MatrixEvent): boolean =>
  event.getType() === 'm.reaction' || event.getWireType() === 'm.reaction';

const DECRYPTION_FAILURE_CODES: readonly DecryptionFailureCode[] = [
  'MEGOLM_UNKNOWN_INBOUND_SESSION_ID',
  'MEGOLM_KEY_WITHHELD',
  'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE',
  'OLM_UNKNOWN_MESSAGE_INDEX',
  'HISTORICAL_MESSAGE_NO_KEY_BACKUP',
  'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED',
  'HISTORICAL_MESSAGE_WORKING_BACKUP',
  'HISTORICAL_MESSAGE_USER_NOT_JOINED',
  'SENDER_IDENTITY_PREVIOUSLY_VERIFIED',
  'UNSIGNED_SENDER_DEVICE',
  'UNKNOWN_SENDER_DEVICE',
  'UNKNOWN_ERROR',
];

const decryptionFailureCode = (event: MatrixEvent): DecryptionFailureCode | undefined => {
  const code = event.decryptionFailureReason;
  return code && DECRYPTION_FAILURE_CODES.includes(code as DecryptionFailureCode)
    ? (code as DecryptionFailureCode)
    : undefined;
};

const decryptionFailureReason = (
  event: MatrixEvent,
  content: JsonObject
): DecryptionFailureReason | undefined => {
  const code = decryptionFailureCode(event);
  if (code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID') return 'missing-keys';
  if (code === 'UNSIGNED_SENDER_DEVICE' || code === 'UNKNOWN_SENDER_DEVICE')
    return 'unknown-device';
  if (code) return 'unknown';
  return content.msgtype === 'm.bad.encrypted' ? 'missing-keys' : undefined;
};

const toMatrixEventView = (event: MatrixEvent): MatrixEventView => {
  const raw = event.event;
  const originServerTs = numberOrUndefined(raw.origin_server_ts);
  return {
    event_id: event.getId() ?? '',
    ...(typeof raw.room_id === 'string' ? { room_id: raw.room_id } : {}),
    sender: event.getSender() ?? '',
    type: event.getWireType(),
    content: toPlainJsonObject(raw.content),
    ...(originServerTs !== undefined ? { origin_server_ts: originServerTs } : {}),
    ...(typeof raw.state_key === 'string' ? { state_key: raw.state_key } : {}),
    ...(raw.unsigned !== undefined ? { unsigned: toPlainJsonObject(raw.unsigned) } : {}),
  };
};

const originalContentOf = (event: MatrixEvent): JsonObject =>
  toPlainJsonObject(event.getOriginalContent());

const editContentOf = (edit: MatrixEvent): JsonObject =>
  toPlainJsonObject(edit.getOriginalContent<{ 'm.new_content'?: unknown }>()['m.new_content']);

const toEventSource = (event: MatrixEvent, edit?: MatrixEvent): TimelineEventSourceView => ({
  original: toMatrixEventView(event),
  effective: toMatrixEventView(
    new MatrixEvent({
      ...event.getEffectiveEvent(),
      type: event.getType(),
      content: edit ? editContentOf(edit) : originalContentOf(event),
    })
  ),
});

const timelineRelation = (event: MatrixEvent): TimelineRelationView | undefined => {
  const relation = event.getRelation();
  if (!relation) return undefined;
  return {
    relType: relation.rel_type ?? '',
    ...(typeof relation.event_id === 'string' ? { eventId: relation.event_id } : {}),
    ...(typeof relation.key === 'string' ? { key: relation.key } : {}),
    ...(event.replyEventId !== undefined ? { inReplyTo: event.replyEventId } : {}),
  };
};

const owningTimelineSet = (room: Room, event: MatrixEvent): EventTimelineSet =>
  room.getTimelineForEvent(event.getId() ?? '')?.getTimelineSet() ??
  room.getUnfilteredTimelineSet();

type RelationMap = ReadonlyMap<string, readonly MatrixEvent[]>;

const EMPTY_RELATIONS: readonly MatrixEvent[] = [];

const mergeRelationEvents = (...groups: readonly (readonly MatrixEvent[])[]): MatrixEvent[] => {
  const merged: MatrixEvent[] = [];
  const seen = new Set<string>();
  groups.forEach((events) => {
    events.forEach((event) => {
      const eventId = event.getId();
      if (!eventId || seen.has(eventId)) return;
      seen.add(eventId);
      merged.push(event);
    });
  });
  return merged;
};

const buildRelationMap = (
  room: Room,
  events: readonly MatrixEvent[],
  timelineSet?: EventTimelineSet
): RelationMap => {
  const eventById = new Map<string, MatrixEvent>();
  const setByEventId = new Map<string, EventTimelineSet>();
  const fallbackSetByTarget = new Map<string, EventTimelineSet>();
  const projectedBySet = new Map<EventTimelineSet, Map<string, MatrixEvent[]>>();
  const targetIds = new Set<string>();

  const addEvent = (event: MatrixEvent, set: EventTimelineSet) => {
    const eventId = event.getId();
    if (!eventId) return;
    if (!eventById.has(eventId)) eventById.set(eventId, event);
    if (!setByEventId.has(eventId)) setByEventId.set(eventId, set);
    if (!isEdit(event) && !isReaction(event)) return;
    const targetId = event.getRelation()?.event_id;
    if (!targetId) return;
    targetIds.add(targetId);
    if (!fallbackSetByTarget.has(targetId)) fallbackSetByTarget.set(targetId, set);
    const projected = projectedBySet.get(set) ?? new Map<string, MatrixEvent[]>();
    const relations = projected.get(targetId) ?? [];
    relations.push(event);
    projected.set(targetId, relations);
    projectedBySet.set(set, projected);
  };

  const knownSets = [
    ...room.getTimelineSets(),
    ...room.getThreads().map((thread) => thread.timelineSet),
  ];
  if (timelineSet) {
    events.forEach((event) => addEvent(event, timelineSet));
  } else {
    const seenSets = new Set<EventTimelineSet>();
    knownSets.forEach((set) => {
      if (seenSets.has(set)) return;
      seenSets.add(set);
      set.getTimelines().forEach((timeline) => {
        timeline.getEvents().forEach((event) => addEvent(event, set));
      });
    });
    events.forEach((event) => {
      if (eventById.has(event.getId() ?? '')) return;
      addEvent(event, owningTimelineSet(room, event));
    });
  }

  eventById.forEach((_event, eventId) => targetIds.add(eventId));
  const relationsByTarget = new Map<string, readonly MatrixEvent[]>();
  targetIds.forEach((targetId) => {
    const target = eventById.get(targetId);
    const set =
      timelineSet ??
      setByEventId.get(targetId) ??
      fallbackSetByTarget.get(targetId) ??
      (target ? owningTimelineSet(room, target) : undefined);
    const owning = set?.relations.getAllChildEventsForEvent(targetId) ?? [];
    const projected = (set ? projectedBySet.get(set)?.get(targetId) : undefined) ?? [];
    const primary = mergeRelationEvents(owning, projected);
    const bundled = target?.replacingEvent();
    const bundledId = bundled?.getId();
    const foreignBundled =
      bundled &&
      bundledId &&
      knownSets.some(
        (candidate) =>
          candidate !== set &&
          candidate.relations
            .getAllChildEventsForEvent(targetId)
            .some((event) => event.getId() === bundledId)
      );
    relationsByTarget.set(
      targetId,
      mergeRelationEvents(primary, bundled && !foreignBundled ? [bundled] : EMPTY_RELATIONS)
    );
  });
  return relationsByTarget;
};

const validEdits = (event: MatrixEvent, relations: readonly MatrixEvent[]): MatrixEvent[] => {
  const sender = event.getSender();
  return relations.filter((edit) => {
    if (
      edit.getId() === event.getId() ||
      edit.isRedacted() ||
      edit.status === EventStatus.CANCELLED ||
      edit.isDecryptionFailure() ||
      edit.getRelation()?.rel_type !== 'm.replace' ||
      edit.getSender() !== sender
    ) {
      return false;
    }
    const newContent = edit.getOriginalContent<{ 'm.new_content'?: unknown }>()['m.new_content'];
    return isPlainRecord(newContent) && typeof newContent.body === 'string';
  });
};

const newestEdit = (edits: readonly MatrixEvent[]): MatrixEvent | undefined =>
  edits.reduce<MatrixEvent | undefined>((newest, edit) => {
    if (!newest) return edit;
    if (edit.getTs() > newest.getTs()) return edit;
    if (edit.getTs() < newest.getTs()) return newest;
    return (edit.getId() ?? '') > (newest.getId() ?? '') ? edit : newest;
  }, undefined);

const reactionCounts = (
  event: MatrixEvent,
  relations: readonly MatrixEvent[]
): readonly ReactionCountView[] => {
  const groups = new Map<
    string,
    { senders: UserId[]; shortcode?: string; events: ReactionEventView[] }
  >();
  relations.forEach((reaction) => {
    if (
      reaction.isRedacted() ||
      reaction.status === EventStatus.CANCELLED ||
      reaction.isDecryptionFailure() ||
      reaction.getType() !== 'm.reaction' ||
      reaction.getRelation()?.rel_type !== 'm.annotation'
    ) {
      return;
    }
    const relation = reaction.getRelation();
    const sender = reaction.getSender();
    const key = relation?.key;
    if (!sender || typeof key !== 'string') return;
    const group = groups.get(key) ?? { senders: [], events: [] };
    if (!group.senders.includes(sender)) group.senders.push(sender);
    const shortcode = stringOrUndefined(reaction.getOriginalContent().shortcode);
    if (group.shortcode === undefined && shortcode !== undefined) group.shortcode = shortcode;
    group.events.push({
      eventId: reaction.getId() ?? '',
      sender,
      key,
      ...(shortcode !== undefined ? { shortcode } : {}),
    });
    groups.set(key, group);
  });
  return [...groups].map(([key, group]) => ({
    key,
    count: group.senders.length,
    senders: group.senders,
    ...(group.shortcode !== undefined ? { shortcode: group.shortcode } : {}),
    events: group.events,
  }));
};

const redactionMetadata = (
  event: MatrixEvent
): { readonly redactionReason?: string; readonly redactionEventId?: string } => {
  const redaction: unknown = event.getRedactionEvent();
  const unsignedRedaction: unknown = event.getUnsigned().redacted_because;
  const source: unknown =
    isPlainRecord(redaction) && Object.keys(redaction).length > 0 ? redaction : unsignedRedaction;
  if (!isPlainRecord(source)) return {};
  const { content } = source;
  return {
    ...(isPlainRecord(content) && typeof content.reason === 'string'
      ? { redactionReason: content.reason }
      : {}),
    ...(typeof source.event_id === 'string' ? { redactionEventId: source.event_id } : {}),
  };
};

const buildItem = (
  room: Room,
  event: MatrixEvent,
  relationMap: RelationMap = buildRelationMap(room, [event])
): TimelineItem => {
  const eventId = event.getId() ?? '';
  const eventType = event.getWireType();
  const relation = timelineRelation(event);
  const relations = relationMap.get(eventId) ?? EMPTY_RELATIONS;
  const edit = newestEdit(validEdits(event, relations));
  const reactions = reactionCounts(event, relations);
  const base = {
    eventId,
    roomId: room.roomId,
    sender: event.getSender() ?? '',
    timestamp: event.getTs(),
    eventType,
    ...(relation ? { relation } : {}),
    ...(reactions.length > 0 ? { reactions } : {}),
  };
  if (event.isRedacted()) {
    return {
      ...base,
      kind: 'redacted',
      preview: 'Message deleted',
      ...redactionMetadata(event),
    };
  }

  const content = originalContentOf(event);
  if (event.isEncrypted() && (event.isDecryptionFailure() || event.getClearContent() === null)) {
    const effectiveContent = event.isDecryptionFailure()
      ? content
      : toPlainJsonObject(event.getWireContent());
    const failure = decryptionFailureReason(event, effectiveContent);
    const failureCode = decryptionFailureCode(event);
    return {
      ...base,
      kind: 'encrypted',
      preview: 'Unable to decrypt message',
      content: effectiveContent,
      ...(failure !== undefined ? { failure } : {}),
      ...(failureCode !== undefined ? { failureCode } : {}),
    };
  }

  const effectiveType = event.getType();
  if (effectiveType === 'm.sticker') {
    return {
      ...base,
      kind: 'sticker',
      preview: previewText(stringOrUndefined(content.body) ?? ''),
      content,
    };
  }

  if (typeof event.getStateKey() === 'string') {
    const prevContent = toPlainJsonObject(event.getPrevContent());
    return {
      ...base,
      kind: 'state',
      stateKey: event.getStateKey() ?? '',
      preview: effectiveType,
      content,
      ...(Object.keys(prevContent).length > 0 ? { prevContent } : {}),
    };
  }

  if (effectiveType !== 'm.room.message') {
    return { ...base, kind: 'unsupported', preview: effectiveType, content };
  }

  const rawContent = edit ? editContentOf(edit) : content;
  const body = stringOrUndefined(rawContent.body) ?? '';
  const formattedBody = stringOrUndefined(rawContent.formatted_body);
  const format = stringOrUndefined(rawContent.format);
  const attachment = attachmentOf(rawContent);
  const replyTo = event.replyEventId ?? replyTargetOf(event);
  const threadRoot = event.threadRootId;
  const readers = room
    .getUsersReadUpTo(event)
    .filter((userId) => userId !== room.myUserId && userId !== event.getSender());
  const localEchoPrefix = `~${room.roomId}:`;
  const localId = eventId.startsWith(localEchoPrefix)
    ? eventId.slice(localEchoPrefix.length)
    : undefined;
  return {
    ...base,
    kind: 'message',
    preview: previewText(body),
    ...(localId !== undefined ? { localId } : {}),
    content: {
      msgtype: stringOrUndefined(rawContent.msgtype) ?? 'm.text',
      body,
      ...(formattedBody !== undefined && format !== undefined ? { formattedBody, format } : {}),
      ...(attachment !== undefined ? { attachment } : {}),
      raw: rawContent,
    },
    status: toSendStatus(event.status),
    ...(edit !== undefined ? { edited: true, editEventId: edit.getId() ?? '' } : {}),
    ...(replyTo !== undefined ? { replyTo } : {}),
    ...(threadRoot !== undefined ? { threadRoot } : {}),
    ...(readers.length > 0 ? { readBy: readers } : {}),
  };
};

const buildSource = (
  room: Room,
  event: MatrixEvent,
  relationMap: RelationMap = buildRelationMap(room, [event])
): TimelineSourceView => {
  const edits = validEdits(event, relationMap.get(event.getId() ?? '') ?? EMPTY_RELATIONS);
  return {
    event: toEventSource(event, newestEdit(edits)),
    edits: edits.map((edit) => toEventSource(edit)),
  };
};

const isRenderableEvent = (event: MatrixEvent): boolean => !isEdit(event) && !isReaction(event);

const renderableEvents = (events: readonly MatrixEvent[]): MatrixEvent[] =>
  events.filter(isRenderableEvent);

const toTimelineView = (
  roomId: string,
  events: readonly MatrixEvent[],
  room: Room | undefined,
  hasBackwardHistory: boolean,
  focusedEventId?: string,
  timelineSet?: EventTimelineSet
): TimelineView => {
  const relationMap = room
    ? buildRelationMap(room, events, timelineSet)
    : new Map<string, readonly MatrixEvent[]>();
  const items = room
    ? renderableEvents(events).map((event) => buildItem(room, event, relationMap))
    : [];

  const ownReadUpTo = room?.getEventReadUpTo(room.myUserId) ?? undefined;
  const receiptIndex = ownReadUpTo
    ? events.findIndex((event) => event.getId() === ownReadUpTo)
    : -1;
  const unreadStartIndex =
    receiptIndex >= 0
      ? events.slice(0, receiptIndex + 1).filter(isRenderableEvent).length
      : undefined;
  return {
    roomId,
    items,
    hasBackwardHistory,
    ...(ownReadUpTo !== null && ownReadUpTo !== undefined ? { readUpTo: ownReadUpTo } : {}),
    ...(unreadStartIndex !== undefined ? { unreadStartIndex } : {}),
    ...(focusedEventId !== undefined ? { focusedEventId } : {}),
  };
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
    a.lastActiveTimestamp === b.lastActiveTimestamp &&
    a.membership === b.membership &&
    a.isDirect === b.isDirect &&
    a.isSpace === b.isSpace &&
    a.unread?.total === b.unread?.total &&
    a.unread?.highlight === b.unread?.highlight &&
    a.notificationMode === b.notificationMode &&
    a.topic === b.topic &&
    a.encrypted === b.encrypted &&
    a.roomVersion === b.roomVersion &&
    a.guestCanJoin === b.guestCanJoin &&
    a.memberCount === b.memberCount &&
    a.historyVisibility === b.historyVisibility &&
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

const toFederatedRoomSummaryView = (response: unknown): FederatedRoomSummaryView => {
  if (!isPlainRecord(response) || typeof response.room_id !== 'string') {
    throw new CoreError('invalid-request', 'Invalid room summary');
  }
  const name = stringOrUndefined(response.name);
  const avatarMxc = stringOrUndefined(response.avatar_url);
  const topic = stringOrUndefined(response.topic);
  const joinedMembers = numberOrUndefined(response.num_joined_members);
  const roomType = stringOrUndefined(response.room_type);
  const membership = toMembership(stringOrUndefined(response.membership));
  const roomVersion = stringOrUndefined(response['im.nheko.summary.room_version']);
  const encryption = stringOrUndefined(response['im.nheko.summary.encryption']);
  return {
    roomId: response.room_id,
    ...(name !== undefined ? { name } : {}),
    ...(avatarMxc !== undefined ? { avatarMxc } : {}),
    ...(topic !== undefined ? { topic } : {}),
    ...(joinedMembers !== undefined ? { joinedMembers } : {}),
    ...(roomType !== undefined ? { roomType } : {}),
    ...(membership !== null ? { membership } : {}),
    ...(roomVersion !== undefined ? { roomVersion } : {}),
    ...(encryption !== undefined ? { encryption } : {}),
  };
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toThirdPartyFieldTypes = (value: unknown): Record<string, ThirdPartyFieldTypeView> => {
  if (!isPlainRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, fieldType]) => {
      if (!isPlainRecord(fieldType)) return [];
      const regexp = stringOrUndefined(fieldType.regexp);
      const placeholder = stringOrUndefined(fieldType.placeholder);
      return regexp !== undefined && placeholder !== undefined
        ? [[name, { regexp, placeholder }]]
        : [];
    })
  );
};

const toThirdPartyInstances = (value: unknown): ThirdPartyInstanceView[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((instance) => {
    if (!isPlainRecord(instance) || typeof instance.instance_id !== 'string') return [];
    const instanceId = instance.instance_id;
    const description = stringOrUndefined(instance.desc) ?? instanceId;
    const networkId = stringOrUndefined(instance.network_id) ?? '';
    const icon = stringOrUndefined(instance.icon);
    return [
      {
        instanceId,
        description,
        networkId,
        ...(icon !== undefined ? { icon } : {}),
        fields: toPlainJsonObject(instance.fields),
      },
    ];
  });
};

const toThirdPartyProtocolViews = (response: unknown): readonly ThirdPartyProtocolView[] => {
  if (!isPlainRecord(response)) {
    throw new CoreError('invalid-request', 'Invalid third-party protocols');
  }
  return Object.entries(response).flatMap(([protocol, value]) => {
    if (!isPlainRecord(value)) return [];
    const icon = stringOrUndefined(value.icon);
    return [
      {
        protocol,
        userFields: toStringArray(value.user_fields),
        locationFields: toStringArray(value.location_fields),
        ...(icon !== undefined ? { icon } : {}),
        fieldTypes: toThirdPartyFieldTypes(value.field_types),
        instances: toThirdPartyInstances(value.instances),
      },
    ];
  });
};

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

export type MatrixJsCoreOptions = {
  readonly secretStorageKeys?: SecretStorageKeyStore;
};

const redactSecretText = (value: string, secrets: readonly string[]): string =>
  secrets
    .filter((secret) => secret.length > 0)
    .reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value);

const redactSecretData = (value: unknown, secrets: readonly string[]): unknown => {
  if (typeof value === 'string') return redactSecretText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactSecretData(item, secrets));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactSecretData(item, secrets)])
  );
};

const secretStringsToRedact = (inputs: readonly string[]): string[] => {
  const secrets = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      if (value.length > 0) {
        secrets.add(value);
        const escaped = JSON.stringify(value).slice(1, -1);
        if (escaped.length > 0 && escaped !== value) secrets.add(escaped);
      }
      try {
        collect(JSON.parse(value));
      } catch {
        // Non-JSON secrets are still redacted by their exact value.
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === 'object' && value !== null) Object.values(value).forEach(collect);
  };
  inputs.forEach(collect);
  return [...secrets];
};

const normalizeSecretError = (error: unknown, secrets: readonly string[]): CoreError => {
  const normalized = normalizeMatrixError(error);
  const presentSecrets = secretStringsToRedact(secrets);
  if (presentSecrets.length === 0) return normalized;
  return new CoreError(
    normalized.code,
    redactSecretText(normalized.message, presentSecrets),
    normalized.retryable,
    normalized.httpStatus,
    normalized.errcode,
    redactSecretData(normalized.data, presentSecrets),
    normalized.retryAfterMs
  );
};

const normalizeRoomKeyExportError = (error: unknown): CoreError => {
  const normalized = normalizeMatrixError(error);
  return new CoreError(
    normalized.code,
    'Unable to export room keys',
    normalized.retryable,
    normalized.httpStatus,
    normalized.errcode,
    undefined,
    normalized.retryAfterMs
  );
};

export function createMatrixJsCore(
  client: MatrixClient,
  coreOptions: MatrixJsCoreOptions = {}
): HarrierCore {
  const secretStorageKeys = resolveMatrixJsSecretStorage(client, coreOptions.secretStorageKeys);
  let secretStorageLifecycle = 0;
  const resetSecretStorageLifecycle = () => {
    secretStorageLifecycle += 1;
  };
  const invalidateSecretStorage = () => {
    resetSecretStorageLifecycle();
    revokeMatrixJsSecretStorageCallbacks(client);
  };
  const requireCrypto = (): CoreResult<CryptoApi> => {
    const crypto = client.getCrypto();
    return crypto
      ? { ok: true, value: crypto }
      : { ok: false, error: new CoreError('unsupported', 'Crypto is not available', false) };
  };
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
      guestCanJoin: room.getGuestAccess() === 'can_join',
      memberCount: room.getJoinedMemberCount(),
      historyVisibility: room.currentState
        .getStateEvents('m.room.history_visibility', '')
        ?.getContent<{ history_visibility?: string }>().history_visibility,
      joinRule: room.getJoinRule(),
      joinRuleContent: room.currentState.getStateEvents('m.room.join_rules', '')?.getContent() as
        | JsonObject
        | undefined,
      roomType: room.getType(),
      roomVersion: room.currentState
        .getStateEvents('m.room.create', '')
        ?.getContent<{ room_version?: string }>().room_version,
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

  type StateListenerEntry = RoomStateEntry & { roomId: string; eventType: string };
  type PendingStateEntry = {
    readonly event: MatrixEvent;
    readonly entry: StateListenerEntry;
    readonly generation: number;
  };
  const stateListeners = new Set<(entry: StateListenerEntry) => void>();
  const pendingStateByRoom = new Map<string, PendingStateEntry[]>();
  let stateGeneration = 0;
  let lifecycleEpoch = 0;
  let stateLifecycleActive = true;
  let acceptPendingState = true;
  let stateRefreshSuppressionDepth = 0;
  let cleanupEventLayer = () => {};
  let activateEventLayer = () => {};
  const deferredTimelineRooms = new Set<string>();
  const isTimelineLifecycleCurrent = (epoch: number) =>
    stateLifecycleActive && epoch === lifecycleEpoch;
  const canPublishRoomState = () =>
    stateLifecycleActive && acceptPendingState && stateRefreshSuppressionDepth === 0;
  const notifyStateListeners = (entries: readonly StateListenerEntry[]) => {
    entries.forEach((entry) => {
      if (!canPublishRoomState()) return;
      stateListeners.forEach((listener) => listener(entry));
    });
  };
  const activatePendingState = () => {
    stateLifecycleActive = true;
    acceptPendingState = true;
    activateEventLayer();
  };
  const invalidatePendingState = () => {
    stateGeneration += 1;
    pendingStateByRoom.clear();
  };
  const deactivatePendingState = () => {
    lifecycleEpoch += 1;
    stateLifecycleActive = false;
    acceptPendingState = false;
    deferredTimelineRooms.clear();
    cleanupEventLayer();
    invalidatePendingState();
  };

  const buildKnownUsers = (): readonly UserProfileView[] =>
    client.getUsers().map(toUserProfileView);
  const knownUsersStore = createSnapshotStore<readonly UserProfileView[]>(buildKnownUsers());
  const publishKnownUsers = () => {
    if (!stateLifecycleActive) return;
    knownUsersStore.publish(buildKnownUsers());
  };
  const clearKnownUsers = () => knownUsersStore.publish([]);

  const stateStores = new Map<string, WritableSnapshotStore<JsonObject | null>>();
  const stateKeyOf = (roomId: string, eventType: string, key: string) =>
    `${roomId}|${eventType}|${key}`;
  const buildState = (roomId: string, eventType: string, key: string): JsonObject | null => {
    const event = client.getRoom(roomId)?.currentState.getStateEvents(eventType, key);
    return event ? (event.getContent() as JsonObject) : null;
  };
  const publishState = (roomId: string, eventType: string, key: string) => {
    if (!canPublishRoomState()) return;
    const store = stateStores.get(stateKeyOf(roomId, eventType, key));
    if (!store) return;
    const next = buildState(roomId, eventType, key);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };

  const stateEntryStores = new Map<string, WritableSnapshotStore<RoomStateEntry | null>>();
  const buildStateEntry = (
    roomId: string,
    eventType: string,
    key: string
  ): RoomStateEntry | null => {
    const event = client.getRoom(roomId)?.currentState.getStateEvents(eventType, key);
    if (!event) return null;
    return {
      stateKey: event.getStateKey() ?? '',
      content: event.getContent() as JsonObject,
      eventId: event.getId() ?? undefined,
      sender: event.getSender() ?? undefined,
      timestamp: event.getTs() ?? undefined,
    };
  };
  const publishStateEntry = (roomId: string, eventType: string, key: string) => {
    if (!canPublishRoomState()) return;
    const store = stateEntryStores.get(stateKeyOf(roomId, eventType, key));
    if (!store) return;
    const next = buildStateEntry(roomId, eventType, key);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };

  const stateEntriesStores = new Map<string, WritableSnapshotStore<readonly RoomStateEntry[]>>();
  const buildStateEntries = (roomId: string): readonly RoomStateEntry[] => {
    const entries: RoomStateEntry[] = [];
    client.getRoom(roomId)?.currentState.events.forEach((stateKeyToEvents, eventType) => {
      if (eventType === 'm.room.member') return;
      stateKeyToEvents.forEach((event) => {
        entries.push({
          eventType,
          stateKey: event.getStateKey() ?? '',
          content: event.getContent() as JsonObject,
          eventId: event.getId() ?? undefined,
          sender: event.getSender() ?? undefined,
          timestamp: event.getTs() ?? undefined,
        });
      });
    });
    return entries;
  };
  const publishStateEntries = (roomId: string) => {
    if (!canPublishRoomState()) return;
    const store = stateEntriesStores.get(roomId);
    if (!store) return;
    const next = buildStateEntries(roomId);
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
      sender: event.getSender() ?? undefined,
      timestamp: event.getTs() ?? undefined,
    }));
  };
  const publishStateList = (roomId: string, eventType: string) => {
    if (!canPublishRoomState()) return;
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
    if (!canPublishRoomState()) return;
    const store = parentsStores.get(roomId);
    if (!store) return;
    const next = buildParents(roomId);
    if (arrayEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishAccountData = (roomId: string) => {
    if (!canPublishRoomState()) return;
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
    if (!canPublishRoomState()) return;
    const store = roomStores.get(roomId);
    if (!store) return;
    const next = buildRoomView(roomId);
    if (roomViewEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishMembers = (roomId: string) => {
    if (!canPublishRoomState()) return;
    const store = memberStores.get(roomId);
    if (!store) return;
    const next = buildMembers(roomId);
    if (memberListEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishPowerLevels = (roomId: string) => {
    if (!canPublishRoomState()) return;
    const store = powerLevelsStores.get(roomId);
    if (!store) return;
    const next = buildPowerLevels(roomId);
    if (JSON.stringify(next) === JSON.stringify(store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishCreators = (roomId: string) => {
    if (!canPublishRoomState()) return;
    const store = creatorStores.get(roomId);
    if (!store) return;
    const next = buildCreators(roomId);
    if (arrayEqual(next, store.getSnapshot().value)) return;
    store.publish(next);
  };
  const publishRoomProjections = (roomId: string) => {
    if (!canPublishRoomState()) return;
    publishRoomView(roomId);
    publishMembers(roomId);
    publishPowerLevels(roomId);
    publishCreators(roomId);
  };
  const refresh = () => {
    if (!canPublishRoomState()) return;
    roomToParentsCache = undefined;
    allRoomsStore.publish(allRooms());
    if (!canPublishRoomState()) return;
    roomsStore.publish(joined());
    if (!canPublishRoomState()) return;
    unreadsStore.publish(buildUnreads());
    if (!canPublishRoomState()) return;
    roomStores.forEach((_store, roomId) => publishRoomView(roomId));
    memberStores.forEach((_store, roomId) => publishMembers(roomId));
    powerLevelsStores.forEach((_store, roomId) => publishPowerLevels(roomId));
    creatorStores.forEach((_store, roomId) => publishCreators(roomId));
    accountDataStores.forEach((_store, roomId) => {
      if (!canPublishRoomState()) return;
      ensureAccountDataListener(roomId);
      publishAccountData(roomId);
    });
    parentsStores.forEach((_store, roomId) => publishParents(roomId));
    stateStores.forEach((_store, key) => {
      const [roomId, eventType, stateKey] = key.split('|');
      if (roomId && eventType && stateKey !== undefined) publishState(roomId, eventType, stateKey);
    });
    stateEntryStores.forEach((_store, key) => {
      const [roomId, eventType, stateKey] = key.split('|');
      if (roomId && eventType && stateKey !== undefined) {
        publishStateEntry(roomId, eventType, stateKey);
      }
    });
    stateEntriesStores.forEach((_store, roomId) => publishStateEntries(roomId));
    stateListStores.forEach((_store, key) => {
      const [roomId, eventType] = key.split('|');
      if (roomId && eventType) publishStateList(roomId, eventType);
    });
  };
  const recalculateRoom = (roomId: string): boolean => {
    const room = client.getRoom(roomId);
    if (!room) return false;
    stateRefreshSuppressionDepth += 1;
    try {
      room.recalculate();
    } finally {
      stateRefreshSuppressionDepth -= 1;
    }
    return true;
  };
  const flushRoomState = (roomId: string, generation: number) => {
    if (!canPublishRoomState() || generation !== stateGeneration) return;
    const pending = pendingStateByRoom.get(roomId);
    if (!pending || pending.length === 0) return;
    pendingStateByRoom.delete(roomId);
    if (!recalculateRoom(roomId)) return;
    if (!canPublishRoomState() || generation !== stateGeneration) return;
    refresh();
    if (!canPublishRoomState() || generation !== stateGeneration) return;
    flushDeferredTimelines();
    notifyStateListeners(pending.map(({ entry }) => entry));
  };
  const flushRoomsState = (roomIds: ReadonlySet<string>, generation: number) => {
    roomIds.forEach((roomId) => flushRoomState(roomId, generation));
  };
  const flushAllRoomState = (generation: number) => {
    if (!canPublishRoomState() || generation !== stateGeneration) return;
    const pendingByRoom = new Map(pendingStateByRoom);
    pendingStateByRoom.clear();
    const recalculatedByRoom = new Map<string, PendingStateEntry[]>();
    let lifecycleInvalidated = false;
    pendingByRoom.forEach((pending, roomId) => {
      if (lifecycleInvalidated || !recalculateRoom(roomId)) return;
      if (!canPublishRoomState() || generation !== stateGeneration) {
        lifecycleInvalidated = true;
        return;
      }
      recalculatedByRoom.set(roomId, pending);
    });
    if (lifecycleInvalidated) return;
    refresh();
    if (!canPublishRoomState() || generation !== stateGeneration) return;
    flushDeferredTimelines();
    const entries: StateListenerEntry[] = [];
    recalculatedByRoom.forEach((pending) => {
      pending.forEach(({ entry }) => entries.push(entry));
    });
    notifyStateListeners(entries);
  };
  const refreshIfActive = () => {
    if (canPublishRoomState()) refresh();
  };

  client.on(RoomStateEvent.Events, (event: MatrixEvent) => {
    if (!stateLifecycleActive) return;
    const roomId = event.getRoomId() ?? '';
    const pending = pendingStateByRoom.get(roomId) ?? [];
    pending.push({
      event,
      generation: stateGeneration,
      entry: {
        roomId,
        eventType: event.getType(),
        stateKey: event.getStateKey() ?? '',
        content: event.getContent() as JsonObject,
        eventId: event.getId() ?? undefined,
        sender: event.getSender() ?? undefined,
        timestamp: event.getTs() ?? undefined,
      },
    });
    pendingStateByRoom.set(roomId, pending);
  });
  client.on(ClientEvent.Event, (event: MatrixEvent) => {
    if (!stateLifecycleActive) return;
    const generation = stateGeneration;
    const readyRooms = new Set<string>();
    pendingStateByRoom.forEach((entries, roomId) => {
      if (entries.some(({ event: pendingEvent }) => pendingEvent === event)) readyRooms.add(roomId);
    });
    flushRoomsState(readyRooms, generation);
    if (event.getType() === 'm.presence' || event.getType() === 'm.room.member') {
      publishKnownUsers();
    }
  });
  client.on(ClientEvent.Sync, (state: SyncState) => {
    if (state === SyncState.Error) {
      invalidatePendingState();
      acceptPendingState = false;
      return;
    }
    if (state === SyncState.Stopped) {
      deactivatePendingState();
      clearKnownUsers();
      return;
    }
    if (state !== SyncState.Prepared && state !== SyncState.Syncing) return;
    if (!stateLifecycleActive || stateRefreshSuppressionDepth > 0) return;
    acceptPendingState = true;
    flushAllRoomState(stateGeneration);
  });
  client.on(RoomEvent.Name, refreshIfActive);
  client.on(ClientEvent.Room, refreshIfActive);
  client.on(RoomEvent.MyMembership, refreshIfActive);
  client.on(ClientEvent.AccountData, refreshIfActive);

  const timelines = new Map<string, WritableSnapshotStore<TimelineView>>();
  const liveTimelines = new Map<string, WritableSnapshotStore<TimelineView>>();
  const focusedTimelines = new Map<string, { timeline: EventTimeline; eventId: string }>();
  const sendStores = new Map<string, WritableSnapshotStore<SendStatusView | null>>();
  const sendRooms = new Map<string, string>();
  const sendEvents = new Map<string, MatrixEvent>();
  const uploadStores = new Map<string, WritableSnapshotStore<UploadView | null>>();
  const uploadPromises = new Map<string, Promise<UploadResponse>>();
  let uploadCounter = 0;
  let sendCounter = 0;
  const pendingEventOf = (localId: string): { room: Room; event: MatrixEvent } | undefined => {
    const roomId = sendRooms.get(localId);
    const room = roomId ? client.getRoom(roomId) : undefined;
    // После отправки SDK меняет event_id локального echo на серверный,
    // поэтому держим прямой указатель на объект MatrixEvent.
    const event = sendEvents.get(localId) ?? room?.findEventById(`~${roomId}:${localId}`);
    return room && event ? { room, event } : undefined;
  };
  const publishSendStatus = (localId: string): void => {
    const store = sendStores.get(localId);
    if (!store) return;
    const roomId = sendRooms.get(localId) ?? '';
    const found = pendingEventOf(localId);
    if (!found) {
      store.publish(null);
      return;
    }
    const { event } = found;
    if (event.status === EventStatus.CANCELLED) {
      store.publish(null);
      return;
    }
    const status = toSendStatus(event.status);
    let error: string | undefined;
    if (status === 'failed' && event.error) {
      error = event.error instanceof Error ? event.error.message : 'Send failed';
    }
    store.publish({
      localId,
      roomId,
      status,
      ...(error !== undefined ? { error } : {}),
    });
  };
  const refreshSendStatuses = (): void => {
    sendStores.forEach((_store, localId) => publishSendStatus(localId));
  };
  const sendWithTxn = (
    roomId: string,
    send: (txnId: string) => Promise<unknown>
  ): CoreResult<string> => {
    const room = client.getRoom(roomId);
    if (!room) {
      return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
    }
    sendCounter += 1;
    const localId = `harrier-local-${sendCounter}`;
    sendRooms.set(localId, roomId);
    if (!sendStores.has(localId)) {
      sendStores.set(localId, createSnapshotStore<SendStatusView | null>(null));
    }
    const sent = send(localId);
    const found = pendingEventOf(localId);
    if (found) sendEvents.set(localId, found.event);
    sent.then(() => publishSendStatus(localId)).catch(() => publishSendStatus(localId));
    publishSendStatus(localId);
    return { ok: true, value: localId };
  };
  const buildLiveTimeline = (roomId: string) => {
    const room = client.getRoom(roomId) ?? undefined;
    const anchor = room?.getLiveTimeline();
    const events = anchor ? collectLinkedEvents(anchor) : [];
    const hasBackwardHistory = anchor
      ? firstLinkedTimeline(anchor).getPaginationToken(EventTimeline.BACKWARDS) != null
      : false;
    return toTimelineView(
      roomId,
      events,
      room,
      hasBackwardHistory,
      undefined,
      anchor?.getTimelineSet()
    );
  };
  const buildTimeline = (roomId: string) => {
    const room = client.getRoom(roomId) ?? undefined;
    const focus = focusedTimelines.get(roomId);
    const anchor = focus?.timeline ?? room?.getLiveTimeline();
    const events = anchor ? collectLinkedEvents(anchor) : [];
    const hasBackwardHistory = anchor
      ? firstLinkedTimeline(anchor).getPaginationToken(EventTimeline.BACKWARDS) != null
      : false;
    return toTimelineView(
      roomId,
      events,
      room,
      hasBackwardHistory,
      focus?.eventId,
      anchor?.getTimelineSet()
    );
  };
  type ObservedEvent = {
    readonly roomId: string;
    readonly eventId: string;
    readonly store: WritableSnapshotStore<TimelineItem | null | undefined>;
  };
  const eventStores = new Map<string, ObservedEvent>();
  const eventStoreKey = (roomId: string, eventId: string) => `${roomId}\u0000${eventId}`;
  const resolveLocalEvent = (roomId: string, eventId: string): MatrixEvent | undefined =>
    client.getRoom(roomId)?.findEventById(eventId);
  const resolveEvent = async (
    roomId: string,
    eventId: string,
    epoch: number
  ): Promise<MatrixEvent | undefined> => {
    if (!isTimelineLifecycleCurrent(epoch)) return undefined;
    const room = client.getRoom(roomId);
    if (!room) return undefined;
    const local = resolveLocalEvent(roomId, eventId);
    if (local) return local;
    try {
      const timeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
      if (!isTimelineLifecycleCurrent(epoch) || client.getRoom(roomId) !== room) return undefined;
      if (!timeline) return undefined;
      return collectLinkedEvents(timeline).find((event) => event.getId() === eventId);
    } catch {
      return undefined;
    }
  };
  const publishObservedEvent = (
    roomId: string,
    eventId: string,
    epoch: number,
    relationMap?: RelationMap
  ): void => {
    if (!isTimelineLifecycleCurrent(epoch)) return;
    const observed = eventStores.get(eventStoreKey(roomId, eventId));
    if (!observed) return;
    const room = client.getRoom(roomId);
    const event = room?.findEventById(eventId);
    observed.store.publish(event && room ? buildItem(room, event, relationMap) : null);
  };
  const publishObservedRoom = (roomId: string, epoch: number): void => {
    if (!isTimelineLifecycleCurrent(epoch)) return;
    const room = client.getRoom(roomId);
    const observed = [...eventStores.values()].filter((entry) => entry.roomId === roomId);
    if (observed.length === 0) return;
    const events = observed.flatMap(({ eventId }) => {
      const event = room?.findEventById(eventId);
      return event ? [event] : [];
    });
    const relationMap = room ? buildRelationMap(room, events) : undefined;
    observed.forEach(({ eventId }) => publishObservedEvent(roomId, eventId, epoch, relationMap));
  };
  const resolveAndPublishEvent = async (
    roomId: string,
    eventId: string,
    epoch: number,
    store: WritableSnapshotStore<TimelineItem | null | undefined>
  ): Promise<void> => {
    const event = await resolveEvent(roomId, eventId, epoch);
    if (
      !isTimelineLifecycleCurrent(epoch) ||
      eventStores.get(eventStoreKey(roomId, eventId))?.store !== store
    ) {
      return;
    }
    const room = client.getRoom(roomId);
    store.publish(event && room ? buildItem(room, event) : null);
  };
  const publishTimeline = (roomId: string, epoch: number): void => {
    if (!isTimelineLifecycleCurrent(epoch)) return;
    if (stateRefreshSuppressionDepth > 0) {
      deferredTimelineRooms.add(roomId);
      return;
    }
    const displayStore = timelines.get(roomId);
    if (displayStore) {
      const next = buildTimeline(roomId);
      if (!isTimelineLifecycleCurrent(epoch)) return;
      displayStore.publish(next);
    }
    if (!isTimelineLifecycleCurrent(epoch)) return;
    const liveStore = liveTimelines.get(roomId);
    if (liveStore) {
      const next = buildLiveTimeline(roomId);
      if (!isTimelineLifecycleCurrent(epoch)) return;
      liveStore.publish(next);
    }
    if (!isTimelineLifecycleCurrent(epoch)) return;
    publishObservedRoom(roomId, epoch);
  };
  function flushDeferredTimelines() {
    const epoch = lifecycleEpoch;
    if (!isTimelineLifecycleCurrent(epoch)) {
      deferredTimelineRooms.clear();
      return;
    }
    if (stateRefreshSuppressionDepth > 0) return;
    const roomIds = [...deferredTimelineRooms];
    deferredTimelineRooms.clear();
    roomIds.forEach((roomId) => publishTimeline(roomId, epoch));
  }
  const republish = (_event: MatrixEvent, room: Room | undefined) => {
    const epoch = lifecycleEpoch;
    if (!isTimelineLifecycleCurrent(epoch)) return;
    if (canPublishRoomState()) {
      refresh();
      if (room && isTimelineLifecycleCurrent(epoch)) publishRoomProjections(room.roomId);
    }
    if (room && isTimelineLifecycleCurrent(epoch)) publishTimeline(room.roomId, epoch);
  };
  const pendingLifecycleEvents = new Map<string, MatrixEvent>();
  let lifecycleEventScheduled = false;
  const scheduleLifecyclePublish = (event: MatrixEvent) => {
    if (!stateLifecycleActive) return;
    const roomId = event.getRoomId();
    if (!roomId) return;
    pendingLifecycleEvents.set(roomId, event);
    if (lifecycleEventScheduled) return;
    lifecycleEventScheduled = true;
    queueMicrotask(() => {
      lifecycleEventScheduled = false;
      const epoch = lifecycleEpoch;
      const events = [...pendingLifecycleEvents.values()];
      pendingLifecycleEvents.clear();
      if (!isTimelineLifecycleCurrent(epoch)) return;
      events.forEach((pendingEvent) => {
        const room = client.getRoom(pendingEvent.getRoomId() ?? '');
        if (room && isTimelineLifecycleCurrent(epoch)) republish(pendingEvent, room);
      });
    });
  };
  const timelineListener = (_event: MatrixEvent, room: Room | undefined) => republish(_event, room);
  const localEchoListener = (_event: MatrixEvent, room: Room | undefined) => {
    republish(_event, room);
    refreshSendStatuses();
  };
  const lifecycleEventListener = (event: MatrixEvent) => scheduleLifecyclePublish(event);
  const redactionListener = (event: MatrixEvent) => scheduleLifecyclePublish(event);
  const deletedRoomListener = (roomId: string) => {
    const epoch = lifecycleEpoch;
    eventStores.forEach(({ roomId: observedRoomId, store }) => {
      if (observedRoomId === roomId && isTimelineLifecycleCurrent(epoch)) store.publish(null);
    });
  };
  let eventListenersAttached = false;
  activateEventLayer = () => {
    if (eventListenersAttached) return;
    eventListenersAttached = true;
    client.on(RoomEvent.Timeline, timelineListener);
    client.on(RoomEvent.Receipt, timelineListener);
    client.on(RoomEvent.LocalEchoUpdated, localEchoListener);
    client.on(RoomEvent.Redaction, redactionListener);
    client.on(RoomEvent.RedactionCancelled, redactionListener);
    client.on(MatrixEventEvent.Decrypted, lifecycleEventListener);
    client.on(MatrixEventEvent.Replaced, lifecycleEventListener);
    client.on(ClientEvent.DeleteRoom, deletedRoomListener);
    eventStores.forEach(({ roomId, eventId, store }) => {
      if (store.getSnapshot().value === undefined) {
        resolveAndPublishEvent(roomId, eventId, lifecycleEpoch, store).catch(() => undefined);
      }
    });
  };
  cleanupEventLayer = () => {
    if (eventListenersAttached) {
      eventListenersAttached = false;
      client.removeListener(RoomEvent.Timeline, timelineListener);
      client.removeListener(RoomEvent.Receipt, timelineListener);
      client.removeListener(RoomEvent.LocalEchoUpdated, localEchoListener);
      client.removeListener(RoomEvent.Redaction, redactionListener);
      client.removeListener(RoomEvent.RedactionCancelled, redactionListener);
      client.removeListener(MatrixEventEvent.Decrypted, lifecycleEventListener);
      client.removeListener(MatrixEventEvent.Replaced, lifecycleEventListener);
      client.removeListener(ClientEvent.DeleteRoom, deletedRoomListener);
    }
    eventStores.clear();
    pendingLifecycleEvents.clear();
  };
  activateEventLayer();

  const profileStores = new Map<string, WritableSnapshotStore<UserProfileView>>();
  const buildProfile = (userId: string): UserProfileView => {
    const user = client.getUser(userId);
    return user ? toUserProfileView(user) : { userId };
  };
  const publishProfile = (userId: string) => {
    profileStores.get(userId)?.publish(buildProfile(userId));
  };
  const publishUserProfile = (_event: MatrixEvent | undefined, user: User) => {
    publishProfile(user.userId);
    publishKnownUsers();
  };
  client.on(UserEvent.AvatarUrl, publishUserProfile);
  client.on(UserEvent.DisplayName, publishUserProfile);

  const presenceStores = new Map<string, WritableSnapshotStore<PresenceView | null>>();
  const buildPresence = (userId: string): PresenceView | null => {
    const user = client.getUser(userId);
    if (!user) return null;
    const status =
      user.presence === 'online' || user.presence === 'unavailable' ? user.presence : 'offline';
    return {
      userId,
      status,
      ...(user.presenceStatusMsg ? { statusMessage: user.presenceStatusMsg } : {}),
      active: user.currentlyActive,
      ...(Number.isFinite(user.getLastActiveTs()) ? { lastActiveTs: user.getLastActiveTs() } : {}),
    };
  };
  const publishPresence = (_event: MatrixEvent | undefined, user: User) => {
    presenceStores.get(user.userId)?.publish(buildPresence(user.userId));
  };
  const publishPresenceAndKnownUsers = (event: MatrixEvent | undefined, user: User) => {
    publishPresence(event, user);
    publishKnownUsers();
  };
  client.on(UserEvent.Presence, publishPresenceAndKnownUsers);
  client.on(UserEvent.CurrentlyActive, publishPresence);
  client.on(UserEvent.LastPresenceTs, publishPresence);

  const devicesStore = createSnapshotStore<readonly DeviceView[] | null>(null);
  const trustStores = new Map<string, WritableSnapshotStore<DeviceTrust>>();
  const unverifiedCountStores = new Map<string, WritableSnapshotStore<number | undefined>>();
  const trustKey = (userId: string, deviceId: string) => `${userId}\u0000${deviceId}`;
  const countKey = (userId: string, deviceIds: readonly string[]) =>
    `${userId}\u0000${deviceIds.join('\u0000')}`;

  const buildTrust = async (userId: string, deviceId: string): Promise<DeviceTrust> => {
    if (!deviceId) return 'unknown';
    const crypto = client.getCrypto();
    if (!crypto) return 'unsupported';
    try {
      const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
      if (!status) return 'unsupported';
      return status.crossSigningVerified ? 'verified' : 'unverified';
    } catch {
      return 'unsupported';
    }
  };

  const publishUnverifiedCounts = (userId: string) => {
    unverifiedCountStores.forEach((store, key) => {
      if (!key.startsWith(`${userId}\u0000`)) return;
      const ids = key
        .slice(userId.length + 1)
        .split('\u0000')
        .filter(Boolean);
      store.publish(
        ids.filter(
          (deviceId) =>
            trustStores.get(trustKey(userId, deviceId))?.getSnapshot().value === 'unverified'
        ).length
      );
    });
  };

  const publishTrust = async (userId: string, deviceId: string): Promise<DeviceTrust> => {
    const trust = await buildTrust(userId, deviceId);
    trustStores.get(trustKey(userId, deviceId))?.publish(trust);
    publishUnverifiedCounts(userId);
    return trust;
  };

  const refreshDevices = async (): Promise<CoreResult<void>> => {
    try {
      const data = await client.getDevices();
      const userId = client.getSafeUserId();
      const currentDeviceId = client.getDeviceId();
      let ed25519: string | undefined;
      try {
        ed25519 = (await client.getCrypto()?.getOwnDeviceKeys())?.ed25519;
      } catch {
        ed25519 = undefined;
      }
      const devices = await Promise.all(
        (data.devices ?? []).map(async (device) => {
          const trust = await buildTrust(userId, device.device_id);
          trustStores.get(trustKey(userId, device.device_id))?.publish(trust);
          const isCurrent = device.device_id === currentDeviceId;
          return {
            deviceId: device.device_id,
            ...(typeof device.display_name === 'string'
              ? { displayName: device.display_name }
              : {}),
            ...(typeof device.last_seen_ip === 'string' ? { lastSeenIp: device.last_seen_ip } : {}),
            ...(typeof device.last_seen_ts === 'number' ? { lastSeenTs: device.last_seen_ts } : {}),
            isCurrent,
            trust,
            ...(isCurrent && ed25519 ? { ed25519 } : {}),
          };
        })
      );
      devicesStore.publish(devices);
      publishUnverifiedCounts(userId);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };

  const refreshTrustForUser = (userId: string) => {
    trustStores.forEach((_store, key) => {
      if (!key.startsWith(`${userId}\u0000`)) return;
      const deviceId = key.slice(userId.length + 1);
      publishTrust(userId, deviceId).catch(() => undefined);
    });
  };
  client.on(CryptoEvent.DevicesUpdated, (userIds: string[]) => {
    if (userIds.includes(client.getSafeUserId())) {
      refreshDevices().catch(() => undefined);
    }
    userIds.forEach(refreshTrustForUser);
  });
  client.on(CryptoEvent.UserTrustStatusChanged, (userId: string) => {
    refreshTrustForUser(userId);
  });

  const incomingVerificationStore = createSnapshotStore<VerificationRequestView | null>(null);
  const verificationStores = new Map<
    string,
    WritableSnapshotStore<VerificationRequestView | null>
  >();
  const verificationRequests = new Map<string, VerificationRequest>();
  const verificationIds = new WeakMap<VerificationRequest, string>();
  const verificationSas = new Map<string, VerificationRequestView['sas']>();
  const attachedSasCallbacks = new Map<string, ShowSasCallbacks>();
  const attachedVerifiers = new WeakSet<Verifier>();
  let verificationCounter = 0;

  const verificationPhaseOf = (phase: VerificationPhase): VerificationPhaseView => {
    switch (phase) {
      case VerificationPhase.Unsent:
        return 'unsent';
      case VerificationPhase.Requested:
        return 'requested';
      case VerificationPhase.Ready:
        return 'ready';
      case VerificationPhase.Started:
        return 'started';
      case VerificationPhase.Cancelled:
        return 'cancelled';
      case VerificationPhase.Done:
        return 'done';
      default:
        return 'unsent';
    }
  };

  const buildVerificationView = (
    id: string,
    request: VerificationRequest
  ): VerificationRequestView => ({
    id,
    otherUserId: request.otherUserId,
    ...(request.otherDeviceId ? { otherDeviceId: request.otherDeviceId } : {}),
    isSelf: request.isSelfVerification,
    initiatedByMe: request.initiatedByMe,
    hasVerifier: !!request.verifier,
    phase: verificationPhaseOf(request.phase),
    ...(verificationSas.get(id) ? { sas: verificationSas.get(id) } : {}),
  });

  const attachVerifier = (id: string, verifier: Verifier) => {
    if (attachedVerifiers.has(verifier)) return;
    attachedVerifiers.add(verifier);
    verifier.on(VerifierEvent.ShowSas, (data: ShowSasCallbacks) => {
      attachedSasCallbacks.set(id, data);
      verificationSas.set(id, {
        emoji: (data.sas.emoji ?? []).map(([emoji, name]) => ({ emoji, name })),
      });
      const request = verificationRequests.get(id);
      if (request) verificationStores.get(id)?.publish(buildVerificationView(id, request));
    });
    verifier.on(VerifierEvent.Cancel, () => {
      const request = verificationRequests.get(id);
      if (request) {
        verificationStores.get(id)?.publish({
          ...buildVerificationView(id, request),
          phase: 'cancelled',
        });
      }
    });
    verifier.verify().catch(() => undefined);
  };

  const registerVerification = (request: VerificationRequest): string => {
    const existingId = verificationIds.get(request);
    if (existingId) return existingId;
    verificationCounter += 1;
    const id = `harrier-verify-${verificationCounter}`;
    verificationIds.set(request, id);
    verificationRequests.set(id, request);
    const store = createSnapshotStore<VerificationRequestView | null>(
      buildVerificationView(id, request)
    );
    verificationStores.set(id, store);
    const publish = () => {
      const view = buildVerificationView(id, request);
      store.publish(view);
      if (view.phase === 'done' || view.phase === 'cancelled') {
        incomingVerificationStore.publish(null);
      }
      if (request.verifier) attachVerifier(id, request.verifier);
      if (view.phase === 'done' || view.phase === 'cancelled') {
        refreshDevices().catch(() => undefined);
      }
    };
    request.on(VerificationRequestEvent.Change, publish);
    if (request.verifier) attachVerifier(id, request.verifier);
    return id;
  };

  client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
    const id = registerVerification(request);
    incomingVerificationStore.publish(buildVerificationView(id, request));
  });

  const verificationById = (id: string) => {
    const request = verificationRequests.get(id);
    if (!request)
      return {
        ok: false as const,
        error: new CoreError('not-found', `Unknown verification ${id}`),
      };
    return { ok: true as const, request };
  };

  const runVerificationCommand = async (
    id: string,
    action: (request: VerificationRequest) => Promise<void> | void
  ): Promise<CoreResult<void>> => {
    const found = verificationById(id);
    if (!found.ok) return found;
    try {
      await action(found.request);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };

  const callsStore = createSnapshotStore<readonly CallView[]>([]);
  const callSessionStores = new Map<string, WritableSnapshotStore<CallView | null>>();
  const callSessions = new Map<string, MatrixRTCSession>();
  const buildCallView = (roomId: string, session?: MatrixRTCSession): CallView | null =>
    session
      ? {
          roomId,
          participants: session.memberships.map((membership) => ({
            userId: membership.userId,
            deviceId: membership.deviceId,
            memberId: membership.memberId,
            ...(membership.callIntent ? { callIntent: membership.callIntent } : {}),
          })),
        }
      : null;
  const refreshCallSession = (roomId: string) => {
    callSessionStores.get(roomId)?.publish(buildCallView(roomId, callSessions.get(roomId)));
  };
  const mediaConfigStore = createSnapshotStore<MediaConfigView>({});
  const mediaAuthenticatedStore = createSnapshotStore(false);
  const refreshMediaConfig = async (): Promise<CoreResult<void>> => {
    try {
      const config = await client.getMediaConfig();
      const maxUploadSize = (config as { 'm.upload.size'?: number })['m.upload.size'];
      mediaConfigStore.publish(typeof maxUploadSize === 'number' ? { maxUploadSize } : {});
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };
  refreshMediaConfig().catch(() => undefined);
  client
    .getVersions()
    .then((versions) => {
      mediaAuthenticatedStore.publish(
        versions.versions.includes('v1.11') ||
          !!(versions.unstable_features as Record<string, boolean> | undefined)?.[
            'org.matrix.msc3916.stable'
          ]
      );
    })
    .catch(() => undefined);

  const pushRulesStore = createSnapshotStore<JsonObject>({});
  const notificationPreferencesStore = createSnapshotStore<NotificationPreferencesView>({
    mute: [],
    specialMessages: [],
    allMessages: [],
  });
  const modeFromActions = (actions: readonly unknown[]): RoomNotificationModeView => {
    const hasNotify = actions.includes('notify');
    if (!hasNotify) return 'mute';
    const hasSound = actions.some(
      (action) =>
        typeof action === 'object' &&
        action !== null &&
        'set_tweak' in action &&
        action.set_tweak === 'sound'
    );
    return hasSound ? 'all' : 'special';
  };

  const refreshNotificationPreferences = async (): Promise<CoreResult<void>> => {
    const rawContent = client
      .getAccountData(EventType.PushRules)
      ?.getContent<{ global?: { override?: PushRule[]; room?: PushRule[] } }>();
    pushRulesStore.publish((rawContent ?? {}) as JsonObject);
    const content = rawContent;
    const isRoomId = (id: string) => /^!.*:.*$/.test(id);
    const mute = (content?.global?.override ?? [])
      .filter(
        (rule) => isRoomId(rule.rule_id ?? '') && modeFromActions(rule.actions ?? []) === 'mute'
      )
      .map((rule) => rule.rule_id as string);
    const room = content?.global?.room ?? [];
    const specialMessages = room
      .filter((rule) => modeFromActions(rule.actions ?? []) === 'special')
      .map((rule) => rule.rule_id as string);
    const allMessages = room
      .filter((rule) => modeFromActions(rule.actions ?? []) === 'all')
      .map((rule) => rule.rule_id as string);
    notificationPreferencesStore.publish({ mute, specialMessages, allMessages });
    return { ok: true, value: undefined };
  };
  refreshNotificationPreferences().catch(() => undefined);
  client.on(ClientEvent.AccountData, () => {
    refreshNotificationPreferences().catch(() => undefined);
  });

  const keyRequestSentAt = new Map<string, number>();
  const backupKeyCachedListeners = new Set<() => void>();
  const backupStatusStore = createSnapshotStore<BackupStatusView>({
    enabled: false,
    infoAbsent: false,
    sessionsRemaining: 0,
  });
  const backupProgressStore = createSnapshotStore<BackupProgressView>({ status: 'idle' });
  let backupRemaining = 0;
  let backupFailure: string | undefined;
  let backupInfoAbsent = false;
  let backupVersion: string | undefined;
  let backupCount: number | undefined;
  let backupTrust: BackupStatusView['trust'];
  let backupRefreshGeneration = 0;

  const cancelledBackupRefresh = (): CoreResult<void> => ({
    ok: false,
    error: new CoreError('cancelled', 'Backup status refresh superseded', false),
  });

  const publishBackupStatus = () => {
    backupStatusStore.publish({
      enabled: backupRemaining === 0 && !backupFailure && !backupInfoAbsent,
      ...(backupVersion !== undefined ? { version: backupVersion } : {}),
      ...(backupCount !== undefined ? { count: backupCount } : {}),
      infoAbsent: backupInfoAbsent,
      sessionsRemaining: backupRemaining,
      ...(backupFailure !== undefined ? { failure: backupFailure } : {}),
      ...(backupTrust !== undefined ? { trust: backupTrust } : {}),
    });
  };

  const refreshBackupStatus = async (): Promise<CoreResult<void>> => {
    const crypto = client.getCrypto();
    if (!crypto) return { ok: true, value: undefined };
    backupRefreshGeneration += 1;
    const requestGeneration = backupRefreshGeneration;
    try {
      const version = await crypto.getActiveSessionBackupVersion();
      if (requestGeneration !== backupRefreshGeneration) return cancelledBackupRefresh();
      const info = await crypto.getKeyBackupInfo();
      if (requestGeneration !== backupRefreshGeneration) return cancelledBackupRefresh();
      let nextTrust = backupTrust;
      if (info && nextTrust === undefined) {
        const trust = await crypto.isKeyBackupTrusted(info);
        if (requestGeneration !== backupRefreshGeneration) return cancelledBackupRefresh();
        nextTrust = {
          trusted: trust.trusted,
          matchesDecryptionKey: trust.matchesDecryptionKey,
        };
      }
      backupVersion = info?.version ?? version ?? undefined;
      backupCount = info?.count ?? undefined;
      backupInfoAbsent = info === null;
      backupTrust = nextTrust;
      publishBackupStatus();
      return { ok: true, value: undefined };
    } catch (error) {
      if (requestGeneration !== backupRefreshGeneration) return cancelledBackupRefresh();
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };

  client.on(CryptoEvent.KeyBackupStatus, (enabled: boolean) => {
    if (!enabled) {
      backupInfoAbsent = false;
      backupVersion = undefined;
      backupCount = undefined;
      backupTrust = undefined;
    }
    refreshBackupStatus().catch(() => undefined);
  });
  client.on(CryptoEvent.KeyBackupSessionsRemaining, (remaining: number) => {
    backupRemaining = remaining;
    backupFailure = undefined;
    publishBackupStatus();
    if (remaining === 0) refreshBackupStatus().catch(() => undefined);
  });
  client.on(CryptoEvent.KeyBackupFailed, (failure: string) => {
    if (typeof failure === 'string') {
      backupFailure = failure;
      backupRemaining = 0;
      publishBackupStatus();
    }
  });
  client.on(CryptoEvent.KeyBackupDecryptionKeyCached, () => {
    refreshBackupStatus().catch(() => undefined);
    backupKeyCachedListeners.forEach((listener) => listener());
  });
  refreshBackupStatus().catch(() => undefined);

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

  const capabilitiesStore = createSnapshotStore<CapabilitiesView>({});
  const refreshCapabilities = async (): Promise<CoreResult<void>> => {
    try {
      const capabilities = await client.getCapabilities();
      capabilitiesStore.publish(capabilities as JsonObject);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };
  refreshCapabilities().catch(() => undefined);

  const globalAccountDataTypesStore = createSnapshotStore<readonly string[]>(
    Array.from(client.store.accountData.keys())
  );
  const globalAccountDataStores = new Map<string, WritableSnapshotStore<JsonObject | null>>();
  const globalAccountDataCache = new Map<string, JsonObject | null>();
  const globalAccountDataListeners = new Set<(type: string, content: JsonObject) => void>();
  const publishGlobalAccountData = (type: string, content: JsonObject | null) => {
    globalAccountDataCache.set(type, content);
    globalAccountDataStores.get(type)?.publish(content);
  };
  client.on(ClientEvent.AccountData, (event: MatrixEvent) => {
    const content = event.getContent<JsonObject>();
    publishGlobalAccountData(event.getType(), content);
    globalAccountDataTypesStore.publish(Array.from(client.store.accountData.keys()));
    globalAccountDataListeners.forEach((listener) => listener(event.getType(), content));
  });

  const authMetadataStore = createSnapshotStore<AuthMetadataView | null>(null);
  const refreshAuthMetadata = async (): Promise<CoreResult<void>> => {
    try {
      const metadata = await client.getAuthMetadata().catch(() => undefined);
      authMetadataStore.publish((metadata as AuthMetadataView | undefined) ?? null);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: normalizeMatrixError(error) };
    }
  };
  refreshAuthMetadata().catch(() => undefined);

  const sessionStore = createSnapshotStore<SessionView | null>({
    userId: client.getSafeUserId(),
    deviceId: client.getDeviceId() ?? '',
    ready: false,
  });

  const syncStore = createSnapshotStore<SyncView>({ phase: 'idle' });
  const loggedOutListeners = new Set<() => void>();
  client.on(HttpApiEvent.SessionLoggedOut, () => {
    deactivatePendingState();
    clearKnownUsers();
    invalidateSecretStorage();
    client.stopClient();
    secretStorageKeys.clear().catch(() => undefined);
    client.clearStores().catch(() => undefined);
    sessionStore.publish(null);
    syncStore.publish({ phase: 'stopped' });
    loggedOutListeners.forEach((listener) => listener());
  });

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

  const core: HarrierCore = {
    capabilities: { calls: true, threads: true, crypto: client.getCrypto() != null },
    auth: {
      session: sessionStore,
      accessToken: () => client.getAccessToken() ?? null,
      fallbackAuthUrl(loginType, authSessionId) {
        if (!sessionStore.getSnapshot().value || !loginType || !authSessionId) return null;
        try {
          return client.getFallbackAuthUrl(loginType, authSessionId) || null;
        } catch {
          return null;
        }
      },
      capabilities: capabilitiesStore,
      authMetadata: authMetadataStore,
      accountDataTypes: globalAccountDataTypesStore,
      accountData(type) {
        const existing = globalAccountDataStores.get(type);
        if (existing) return existing;
        const content = globalAccountDataCache.has(type)
          ? globalAccountDataCache.get(type) ?? null
          : client.getAccountData(type as never)?.getContent<JsonObject>() ?? null;
        globalAccountDataCache.set(type, content);
        const store = createSnapshotStore(content);
        globalAccountDataStores.set(type, store);
        return store;
      },
      onAccountData(listener) {
        globalAccountDataListeners.add(listener);
        return () => globalAccountDataListeners.delete(listener);
      },
      async setAccountData(type, content) {
        try {
          await client.setAccountData(type as never, content as never);
          publishGlobalAccountData(type, content);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      refreshCapabilities,
      refreshAuthMetadata,
      async threePids() {
        try {
          const response = await client.getThreePids();
          return { ok: true, value: toThreepidViews(response?.threepids) };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      sync: syncStore,
      async start(): Promise<CoreResult<void>> {
        try {
          activatePendingState();
          syncStore.publish({ phase: 'syncing' });
          client.setSyncPresence(SetPresence.Online);
          await client.startClient({ lazyLoadMembers: true, threadSupport: true });
          publishKnownUsers();
          return { ok: true, value: undefined };
        } catch (error) {
          deactivatePendingState();
          const normalized = normalizeMatrixError(error);
          syncStore.publish({ phase: 'error', error: normalized.message });
          return { ok: false, error: normalized };
        }
      },
      async retrySync() {
        try {
          activatePendingState();
          if (client.clientRunning) client.retryImmediately();
          else await client.startClient({ lazyLoadMembers: true, threadSupport: true });
          publishKnownUsers();
          syncStore.publish({ phase: 'syncing' });
          return { ok: true, value: undefined };
        } catch (error) {
          deactivatePendingState();
          const normalized = normalizeMatrixError(error);
          syncStore.publish({ phase: 'error', error: normalized.message });
          return { ok: false, error: normalized };
        }
      },
      onLoggedOut(listener) {
        loggedOutListeners.add(listener);
        return () => loggedOutListeners.delete(listener);
      },
      async stop() {
        deactivatePendingState();
        clearKnownUsers();
        client.stopClient();
        syncStore.publish({ phase: 'stopped' });
      },
      async logout(): Promise<CoreResult<void>> {
        deactivatePendingState();
        clearKnownUsers();
        invalidateSecretStorage();
        client.stopClient();
        try {
          await client.logout();
        } catch {
          // Local cleanup continues even if the server logout fails.
        }
        try {
          await client.clearStores();
        } finally {
          deactivatePendingState();
          await secretStorageKeys.clear().catch(() => undefined);
          sessionStore.publish(null);
          syncStore.publish({ phase: 'stopped' });
        }
        return { ok: true, value: undefined };
      },
      async clearCache() {
        deactivatePendingState();
        clearKnownUsers();
        client.stopClient();
        try {
          await client.store.deleteAllData();
          deactivatePendingState();
          return { ok: true, value: undefined };
        } catch (error) {
          deactivatePendingState();
          return { ok: false, error: normalizeMatrixError(error) };
        }
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
          .then(() => {
            publishMembers(roomId);
            publishKnownUsers();
          })
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
      async resolveAlias(alias) {
        try {
          const result = await client.getRoomIdForAlias(alias);
          return { ok: true, value: result?.room_id ?? null };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async aliases(roomId) {
        try {
          const local = await client.getLocalAliases(roomId);
          const content = client
            .getRoom(roomId)
            ?.currentState.getStateEvents('m.room.canonical_alias', '')
            ?.getContent<{ alias?: string; alt_aliases?: unknown[] }>();
          return {
            ok: true,
            value: {
              ...(content?.alias ? { canonical: content.alias } : {}),
              alternatives: Array.isArray(content?.alt_aliases)
                ? content.alt_aliases.filter((alias): alias is string => typeof alias === 'string')
                : [],
              local: local.aliases,
            },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async createAlias(alias, roomId) {
        try {
          await client.createAlias(alias, roomId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async deleteAlias(alias) {
        try {
          await client.deleteAlias(alias);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async directoryVisibility(roomId) {
        try {
          const result = await client.getRoomDirectoryVisibility(roomId);
          return { ok: true, value: result.visibility === 'public' ? 'public' : 'private' };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async setDirectoryVisibility(roomId, visibility) {
        try {
          await client.setRoomDirectoryVisibility(roomId, visibility as never);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async mutualRooms(userId) {
        const rooms = new Set<string>();
        let nextBatch: string | undefined;
        try {
          do {
            // eslint-disable-next-line no-await-in-loop
            const result = await client.http.authedRequest<{
              joined?: string[];
              next_batch?: string;
            }>(Method.Get, '/mutual_rooms', { user_id: userId, from: nextBatch }, undefined, {
              prefix: '/_matrix/client/v1',
            });
            (result.joined ?? []).forEach((roomId) => rooms.add(roomId));
            nextBatch = result.next_batch;
          } while (typeof nextBatch === 'string');
          return { ok: true, value: [...rooms] };
        } catch {
          try {
            const shared = await client._unstable_getSharedRooms(userId);
            return { ok: true, value: shared };
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        }
      },
      async searchMessages(params, nextBatch) {
        if (!params.term) {
          return { ok: true, value: { highlights: [], groups: [] } };
        }
        try {
          const response = await client.search({
            body: {
              search_categories: {
                room_events: {
                  event_context: { before_limit: 0, after_limit: 0, include_profile: false },
                  filter: {
                    limit: 20,
                    rooms: params.rooms ? [...params.rooms] : undefined,
                    senders: params.senders ? [...params.senders] : undefined,
                  },
                  include_state: false,
                  order_by: params.order ?? 'recent',
                  search_term: params.term,
                },
              },
            },
            next_batch: nextBatch === '' ? undefined : nextBatch,
          } as never);
          const roomEvents = response.search_categories.room_events;
          const groups: Array<{
            roomId: string;
            items: Array<{
              rank: number;
              event: MessageSearchEventView;
              context: MessageSearchContextView;
            }>;
          }> = [];
          (roomEvents?.results ?? []).forEach((item) => {
            const roomId = item.result.room_id;
            const resultItem = {
              rank: item.rank,
              event: {
                event_id: item.result.event_id,
                room_id: item.result.room_id,
                sender: item.result.sender ?? '',
                type: item.result.type ?? '',
                content: (item.result.content ?? {}) as JsonObject,
                origin_server_ts: item.result.origin_server_ts ?? 0,
                ...(item.result.unsigned
                  ? {
                      unsigned: {
                        ...(item.result.unsigned.redacted_because
                          ? {
                              redacted_because: {
                                content: {
                                  reason:
                                    item.result.unsigned.redacted_because.content?.reason ?? '',
                                },
                              },
                            }
                          : {}),
                      },
                    }
                  : {}),
              },
              context: item.context as unknown as MessageSearchContextView,
            };
            const last = groups[groups.length - 1];
            if (last?.roomId === roomId) {
              last.items.push(resultItem);
            } else {
              groups.push({ roomId, items: [resultItem] });
            }
          });
          return {
            ok: true,
            value: {
              ...(roomEvents?.next_batch ? { nextToken: roomEvents.next_batch } : {}),
              highlights: roomEvents?.highlights ?? [],
              groups,
            },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      viaServers(roomId) {
        const serverOf = (userId: string) => userId.split(':')[1] ?? '';
        const powerLevels = buildPowerLevels(roomId);
        const creators = buildCreators(roomId);
        let highestPowerUserId = creators[0];
        if (!highestPowerUserId && powerLevels.users) {
          let top = -Infinity;
          Object.entries(powerLevels.users).forEach(([userId, power]) => {
            if (power <= (powerLevels.users_default ?? 0) || power <= top) return;
            top = power;
            highestPowerUserId = userId;
          });
        }
        const serverToPop: Record<string, number> = {};
        buildMembers(roomId).forEach((member) => {
          const server = serverOf(member.userId);
          if (!server) return;
          serverToPop[server] = (serverToPop[server] ?? 0) + 1;
        });
        const mostPop3 = Object.keys(serverToPop)
          .sort((a, b) => serverToPop[b] - serverToPop[a])
          .slice(0, 3);
        const via = highestPowerUserId ? [serverOf(highestPowerUserId)].filter(Boolean) : [];
        if (via.length === 0) return mostPop3;
        return via.concat(mostPop3.filter((server) => server !== via[0]).slice(0, 2));
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
          return { ok: false, error: normalizeMatrixError(error) };
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
      stateEntry(roomId, eventType, stateKey = '') {
        const key = stateKeyOf(roomId, eventType, stateKey);
        const existing = stateEntryStores.get(key);
        if (existing) return existing;
        const store = createSnapshotStore(buildStateEntry(roomId, eventType, stateKey));
        stateEntryStores.set(key, store);
        return store;
      },
      onState(listener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
      stateEntries(roomId) {
        const existing = stateEntriesStores.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildStateEntries(roomId));
        stateEntriesStores.set(roomId, store);
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
          return { ok: false, error: normalizeMatrixError(error) };
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
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async leave(roomId): Promise<CoreResult<void>> {
        try {
          await client.leave(roomId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async invite(roomId, userId, reason): Promise<CoreResult<void>> {
        try {
          await client.invite(roomId, userId, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async kick(roomId, userId, reason): Promise<CoreResult<void>> {
        try {
          await client.kick(roomId, userId, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async ban(roomId, userId, reason): Promise<CoreResult<void>> {
        try {
          await client.ban(roomId, userId, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async unban(roomId, userId): Promise<CoreResult<void>> {
        try {
          await client.unban(roomId, userId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async reportEvent(roomId, eventId, score, reason): Promise<CoreResult<void>> {
        try {
          await client.reportEvent(roomId, eventId, score, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async reportRoom(roomId, reason): Promise<CoreResult<void>> {
        try {
          await client.reportRoom(roomId, reason);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
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
          return { ok: false, error: normalizeMatrixError(error) };
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
          return { ok: false, error: normalizeMatrixError(error) };
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
          return { ok: false, error: normalizeMatrixError(error) };
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
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async summary(roomIdOrAlias, via): Promise<CoreResult<FederatedRoomSummaryView>> {
        try {
          const response: unknown = await client.getRoomSummary(
            roomIdOrAlias,
            via ? [...via] : undefined
          );
          return { ok: true, value: toFederatedRoomSummaryView(response) };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async thirdPartyProtocols(): Promise<CoreResult<readonly ThirdPartyProtocolView[]>> {
        try {
          const response: unknown = await client.getThirdpartyProtocols();
          return { ok: true, value: toThirdPartyProtocolViews(response) };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
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
      async markRead(roomId, eventId, privateReceipt = false) {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        const event = room.findEventById(eventId);
        if (!event) {
          return {
            ok: false,
            error: new CoreError('not-found', `Event ${eventId} not found in ${roomId}`),
          };
        }
        try {
          await client.sendReadReceipt(
            event,
            privateReceipt ? ReceiptType.ReadPrivate : ReceiptType.Read
          );
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      timeline(roomId) {
        const existing = timelines.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildTimeline(roomId));
        timelines.set(roomId, store);
        return store;
      },
      liveTimeline(roomId) {
        const existing = liveTimelines.get(roomId);
        if (existing) return existing;
        const store = createSnapshotStore(buildLiveTimeline(roomId));
        liveTimelines.set(roomId, store);
        return store;
      },
      async paginateBackward(roomId, limit): Promise<CoreResult<void>> {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        try {
          const epoch = lifecycleEpoch;
          const anchor = focusedTimelines.get(roomId)?.timeline ?? room.getLiveTimeline();
          await client.paginateEventTimeline(firstLinkedTimeline(anchor), {
            backwards: true,
            limit,
          });
          publishTimeline(roomId, epoch);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async paginateForward(roomId, limit): Promise<CoreResult<void>> {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        try {
          const epoch = lifecycleEpoch;
          const anchor = focusedTimelines.get(roomId)?.timeline ?? room.getLiveTimeline();
          const last = lastLinkedTimeline(anchor);
          if (last.getPaginationToken(EventTimeline.FORWARDS) != null) {
            await client.paginateEventTimeline(last, { backwards: false, limit });
          }
          publishTimeline(roomId, epoch);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async focusEvent(roomId, eventId): Promise<CoreResult<number>> {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        try {
          const epoch = lifecycleEpoch;
          const timeline = await client.getEventTimeline(room.getUnfilteredTimelineSet(), eventId);
          if (!isTimelineLifecycleCurrent(epoch)) {
            return {
              ok: false,
              error: new CoreError('unknown', 'Timeline lifecycle changed during focus'),
            };
          }
          if (!timeline) {
            return {
              ok: false,
              error: new CoreError('not-found', `Event ${eventId} not found in ${roomId}`),
            };
          }
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const renderable = renderableEvents(collectLinkedEvents(timeline));
            const index = renderable.findIndex((event) => event.getId() === eventId);
            if (index >= 0) {
              if (!isTimelineLifecycleCurrent(epoch)) {
                return {
                  ok: false,
                  error: new CoreError('unknown', 'Timeline lifecycle changed during focus'),
                };
              }
              focusedTimelines.set(roomId, { timeline, eventId });
              publishTimeline(roomId, epoch);
              return { ok: true, value: index };
            }
            const first = firstLinkedTimeline(timeline);
            if (first.getPaginationToken(EventTimeline.BACKWARDS) == null) break;
            // eslint-disable-next-line no-await-in-loop -- sequential pagination until the event is loaded
            await client.paginateEventTimeline(first, { backwards: true, limit: 30 });
            if (!isTimelineLifecycleCurrent(epoch)) {
              return {
                ok: false,
                error: new CoreError('unknown', 'Timeline lifecycle changed during focus'),
              };
            }
          }
          return {
            ok: false,
            error: new CoreError('not-found', `Event ${eventId} not found in ${roomId}`),
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      clearFocus(roomId) {
        const epoch = lifecycleEpoch;
        if (focusedTimelines.delete(roomId)) publishTimeline(roomId, epoch);
      },
      async event(roomId, eventId): Promise<CoreResult<TimelineItem | null>> {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        const epoch = lifecycleEpoch;
        const event = await resolveEvent(roomId, eventId, epoch);
        const resolvedRoom = client.getRoom(roomId);
        return {
          ok: true,
          value:
            event && resolvedRoom && isTimelineLifecycleCurrent(epoch)
              ? buildItem(resolvedRoom, event)
              : null,
        };
      },
      async source(roomId, eventId): Promise<CoreResult<TimelineSourceView | null>> {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        const epoch = lifecycleEpoch;
        const event = await resolveEvent(roomId, eventId, epoch);
        const resolvedRoom = client.getRoom(roomId);
        return {
          ok: true,
          value:
            event && resolvedRoom && isTimelineLifecycleCurrent(epoch)
              ? buildSource(resolvedRoom, event)
              : null,
        };
      },
      observeEvent(roomId, eventId) {
        const key = eventStoreKey(roomId, eventId);
        const existing = eventStores.get(key);
        if (existing) {
          if (
            stateLifecycleActive &&
            existing.store.getSnapshot().value === undefined &&
            isTimelineLifecycleCurrent(lifecycleEpoch)
          ) {
            resolveAndPublishEvent(roomId, eventId, lifecycleEpoch, existing.store).catch(
              () => undefined
            );
          }
          return existing.store;
        }
        const store = createSnapshotStore<TimelineItem | null | undefined>(undefined);
        eventStores.set(key, { roomId, eventId, store });
        if (stateLifecycleActive && isTimelineLifecycleCurrent(lifecycleEpoch)) {
          resolveAndPublishEvent(roomId, eventId, lifecycleEpoch, store).catch(() => undefined);
        }
        return store;
      },
    },
    presence: {
      knownUsers: knownUsersStore,
      profile(userId) {
        const existing = profileStores.get(userId);
        if (existing) return existing;
        const store = createSnapshotStore(buildProfile(userId));
        profileStores.set(userId, store);
        return store;
      },
      async refreshProfile(userId) {
        try {
          const info = await client.getProfileInfo(userId);
          const store = profileStores.get(userId);
          store?.publish({
            userId,
            ...(info.avatar_url ? { avatarUrl: info.avatar_url } : {}),
            ...(info.displayname ? { displayName: info.displayname } : {}),
          });
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async setOwnProfile(update) {
        if (update.displayName === undefined && update.avatarUrl === undefined) {
          return {
            ok: false,
            error: new CoreError('invalid-request', 'Empty own profile update'),
          };
        }

        try {
          if (update.displayName !== undefined) {
            await client.setDisplayName(update.displayName);
          }
          if (update.avatarUrl !== undefined) {
            await client.setAvatarUrl(update.avatarUrl ?? '');
          }
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
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
      async setTyping(roomId, typing, timeoutMs) {
        const room = client.getRoom(roomId);
        if (!room)
          return { ok: false, error: new CoreError('not-found', `Unknown room ${roomId}`) };
        try {
          await client.sendTyping(roomId, typing, timeoutMs ?? 20000);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      setLocalOwnStatus(statusMessage) {
        const user = client.getUser(client.getSafeUserId());
        if (!user) return;
        user.presenceStatusMsg = statusMessage;
        user.emit(UserEvent.Presence, undefined, user);
      },
      async getOwnPresence() {
        try {
          const userId = client.getSafeUserId();
          const response = await client.getPresence(userId);
          const status =
            response.presence === 'online' || response.presence === 'unavailable'
              ? response.presence
              : 'offline';
          return {
            ok: true,
            value: {
              userId,
              status,
              ...(response.status_msg ? { statusMessage: response.status_msg } : {}),
              active: response.currently_active ?? false,
              ...(typeof response.last_active_ago === 'number'
                ? { lastActiveTs: Date.now() - response.last_active_ago }
                : {}),
            },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async setOwnPresence(input) {
        try {
          await client.setPresence({
            presence: input.status as SetPresence,
            ...(input.statusMessage !== undefined ? { status_msg: input.statusMessage } : {}),
          });
          const user = client.getUser(client.getSafeUserId());
          if (user) {
            user.presenceStatusMsg = input.statusMessage;
            user.emit(UserEvent.Presence, undefined, user);
          }
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
    },
    media: {
      config: mediaConfigStore,
      authenticated: mediaAuthenticatedStore,
      refreshConfig: refreshMediaConfig,
      url(ref, options) {
        if (ref.encrypted) return null;
        return (
          client.mxcUrlToHttp(
            ref.mxcUrl,
            ref.width,
            ref.height,
            ref.resizeMethod,
            options?.allowDirectLinks,
            options?.allowRedirects,
            options?.useAuthentication ?? mediaAuthenticatedStore.getSnapshot().value
          ) || null
        );
      },
      async resolve(ref) {
        try {
          const url = client.mxcUrlToHttp(
            ref.mxcUrl,
            ref.width,
            ref.height,
            ref.resizeMethod,
            undefined,
            undefined,
            mediaAuthenticatedStore.getSnapshot().value
          );
          if (!url)
            return { ok: false, error: new CoreError('invalid-request', 'Invalid MXC URL') };
          if (!ref.encrypted) return { ok: true, value: { kind: 'url', url } };
          const response = await fetch(url, { method: 'GET' });
          if (!response.ok) {
            return {
              ok: false,
              error: normalizeMatrixError({
                httpStatus: response.status,
                httpHeaders: response.headers,
                error: `Media request failed: ${response.status}`,
              }),
            };
          }
          const data = await response.arrayBuffer();
          const decrypted = await decryptAttachment(data, ref.encrypted as never);
          return {
            ok: true,
            value: {
              kind: 'blob',
              blob: new Blob([decrypted], {
                type: ref.mimeType ?? ref.encrypted.type ?? 'application/octet-stream',
              }),
            },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async thumbnail(ref) {
        return this.resolve(ref);
      },
      async download(ref, filename) {
        if (filename.length === 0) {
          return { ok: false, error: new CoreError('invalid-request', 'Filename is required') };
        }
        const result = await this.resolve(ref);
        if (!result.ok) return result;
        if (result.value.kind === 'blob') return { ok: true, value: result.value.blob };
        const response = await fetch(result.value.url, { method: 'GET' });
        if (!response.ok) {
          return {
            ok: false,
            error: normalizeMatrixError({
              httpStatus: response.status,
              httpHeaders: response.headers,
              error: `Media request failed: ${response.status}`,
            }),
          };
        }
        return { ok: true, value: await response.blob() };
      },
      async getUrlPreview(url, ts) {
        try {
          const preview = await client.getUrlPreview(url, ts);
          const imageUrl = preview['og:image'];
          return {
            ok: true,
            value: {
              ...(typeof preview['og:site_name'] === 'string'
                ? { siteName: preview['og:site_name'] }
                : {}),
              ...(preview['og:title'] ? { title: preview['og:title'] } : {}),
              ...(preview['og:description'] ? { description: preview['og:description'] } : {}),
              ...(imageUrl ? { image: { mxcUrl: imageUrl } } : {}),
            },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
    },
    calls: {
      active: callsStore,
      session(roomId) {
        const existing = callSessionStores.get(roomId);
        if (existing) return existing;
        const room = client.getRoom(roomId);
        const session = room ? client.matrixRTC.getRoomSession(room) : undefined;
        if (session) {
          callSessions.set(roomId, session);
          session.on(MatrixRTCSessionEvent.MembershipsChanged, () => refreshCallSession(roomId));
        }
        const store = createSnapshotStore(buildCallView(roomId, session));
        callSessionStores.set(roomId, store);
        return store;
      },
      async join(roomId) {
        const userId = client.getSafeUserId();
        const deviceId = client.getDeviceId() ?? undefined;
        const call: CallView = {
          roomId,
          participants: [{ userId, ...(deviceId ? { deviceId } : {}) }],
        };
        callsStore.publish([
          ...callsStore.getSnapshot().value.filter((item) => item.roomId !== roomId),
          call,
        ]);
        return { ok: true, value: undefined };
      },
      async leave(roomId) {
        callsStore.publish(callsStore.getSnapshot().value.filter((item) => item.roomId !== roomId));
        return { ok: true, value: undefined };
      },
    },
    notifications: {
      preferences: notificationPreferencesStore,
      pushRules: pushRulesStore,
      refreshPreferences: refreshNotificationPreferences,
      async setPushRuleActions(kind, ruleId, actions) {
        try {
          await client.setPushRuleActions('global', kind as never, ruleId, actions as never);
          return await refreshNotificationPreferences();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async addPushRule(kind, ruleId, actions, options) {
        try {
          await client.addPushRule('global', kind as never, ruleId, {
            actions: actions as never,
            ...(options?.conditions ? { conditions: options.conditions as never } : {}),
            ...(options?.pattern !== undefined ? { pattern: options.pattern } : {}),
          });
          return await refreshNotificationPreferences();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async deletePushRule(kind, ruleId) {
        try {
          await client.deletePushRule('global', kind as never, ruleId);
          return await refreshNotificationPreferences();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async emailNotifications() {
        try {
          const tpIDs = (await client.getThreePids())?.threepids ?? [];
          const emailAddresses = tpIDs
            .filter((id) => id.medium === 'email')
            .map((id) => id.address);
          if (emailAddresses.length === 0) return { ok: true, value: { enabled: false } };
          const pushers = (await client.getPushers())?.pushers ?? [];
          const emailPusher = pushers.find(
            (pusher) => pusher.app_id === 'm.email' && emailAddresses.includes(pusher.pushkey)
          );
          return {
            ok: true,
            value: emailPusher?.pushkey
              ? { enabled: true, email: emailPusher.pushkey }
              : { enabled: false, email: emailAddresses[0] },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async setPusher(pusher) {
        try {
          await client.setPusher(pusher as never);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async list(from, limit, onlyHighlight) {
        try {
          const response = await client.http.authedRequest<{
            notifications?: {
              room_id: string;
              event?: {
                event_id?: string;
                room_id?: string;
                sender?: string;
                type?: string;
                origin_server_ts?: number;
                state_key?: string;
                unsigned?: Record<string, unknown>;
                content?: Record<string, unknown>;
              };
              ts?: number;
              read?: boolean;
            }[];
            next_token?: string;
          }>(Method.Get, '/notifications', {
            from,
            limit,
            only: onlyHighlight ? 'highlight' : undefined,
          });
          const resolved = (response.notifications ?? []).map((item) => {
            const serverEvent = item.event ?? {};
            const eventId = serverEvent.event_id ?? '';
            const room = client.getRoom(item.room_id);
            const local = eventId ? resolveLocalEvent(item.room_id, eventId) : undefined;
            return { item, serverEvent, eventId, room, local };
          });
          const localByRoom = new Map<string, { room: Room; events: MatrixEvent[] }>();
          resolved.forEach(({ item, room, local }) => {
            if (!room || !local) return;
            const entry = localByRoom.get(item.room_id) ?? { room, events: [] };
            entry.events.push(local);
            localByRoom.set(item.room_id, entry);
          });
          const relationMaps = new Map<string, RelationMap>();
          localByRoom.forEach(({ room, events }, roomId) => {
            relationMaps.set(roomId, buildRelationMap(room, events));
          });
          const items: NotificationView[] = resolved.map(
            ({ item, serverEvent, eventId, room, local }) => {
              const originServerTs = serverEvent.origin_server_ts ?? item.ts ?? 0;
              const localEvent = local ? toMatrixEventView(local) : undefined;
              const event: MatrixEventView & { origin_server_ts: number } =
                local && localEvent
                  ? {
                      ...localEvent,
                      room_id: item.room_id,
                      origin_server_ts: localEvent.origin_server_ts ?? originServerTs,
                    }
                  : {
                      event_id: eventId,
                      room_id: item.room_id,
                      sender: serverEvent.sender ?? '',
                      type: serverEvent.type ?? '',
                      content: toPlainJsonObject(serverEvent.content),
                      origin_server_ts: originServerTs,
                      ...(typeof serverEvent.state_key === 'string'
                        ? { state_key: serverEvent.state_key }
                        : {}),
                      ...(serverEvent.unsigned !== undefined
                        ? { unsigned: toPlainJsonObject(serverEvent.unsigned) }
                        : {}),
                    };
              return {
                id: eventId,
                roomId: item.room_id,
                ...(eventId ? { eventId } : {}),
                ...(event.sender ? { senderId: event.sender } : {}),
                type: event.type,
                content: event.content,
                event,
                timelineItem:
                  local && room ? buildItem(room, local, relationMaps.get(item.room_id)) : null,
                timestamp: item.ts ?? event.origin_server_ts ?? 0,
                read: item.read ?? false,
              };
            }
          );
          return {
            ok: true,
            value: { items, ...(response.next_token ? { nextToken: response.next_token } : {}) },
          };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async setRoomMode(roomId, mode, previousMode) {
        try {
          if (previousMode === 'all' || previousMode === 'special') {
            await client.deletePushRule('global', PushRuleKind.RoomSpecific, roomId);
          }
          if (previousMode === 'mute') {
            await client.deletePushRule('global', PushRuleKind.Override, roomId);
          }
          if (mode === 'unset') return await refreshNotificationPreferences();
          if (mode === 'mute') {
            await client.addPushRule('global', PushRuleKind.Override, roomId, {
              conditions: [{ kind: ConditionKind.EventMatch, key: 'room_id', pattern: roomId }],
              actions: [],
            });
            return await refreshNotificationPreferences();
          }
          await client.addPushRule('global', PushRuleKind.RoomSpecific, roomId, {
            actions:
              mode === 'all' ? ['notify', { set_tweak: 'sound', value: 'default' }] : ['notify'],
          } as never);
          return await refreshNotificationPreferences();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
    },
    crypto: {
      devices: devicesStore,
      refreshDevices,
      async exportRoomKeys() {
        const found = requireCrypto();
        if (!found.ok) return found;
        try {
          return { ok: true, value: await found.value.exportRoomKeysAsJson() };
        } catch (error) {
          return { ok: false, error: normalizeRoomKeyExportError(error) };
        }
      },
      async importRoomKeys(keysJson) {
        const found = requireCrypto();
        if (!found.ok) return found;
        try {
          await found.value.importRoomKeysAsJson(keysJson);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeSecretError(error, [keysJson]) };
        }
      },
      backup: {
        status: backupStatusStore,
        progress: backupProgressStore,
        refreshStatus: refreshBackupStatus,
        async reset() {
          const found = requireCrypto();
          if (!found.ok) return found;
          backupRefreshGeneration += 1;
          try {
            await found.value.resetKeyBackup();
            backupTrust = undefined;
            return await refreshBackupStatus();
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        async restore() {
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          try {
            backupProgressStore.publish({ status: 'fetching' });
            await crypto.restoreKeyBackup({
              progressCallback(progress: ImportRoomKeyProgressData) {
                if (progress.stage === ImportRoomKeyStage.Fetch) {
                  backupProgressStore.publish({ status: 'fetching' });
                  return;
                }
                const downloaded = progress.successes + progress.failures;
                if (downloaded === progress.total) {
                  backupProgressStore.publish({ status: 'done' });
                  return;
                }
                backupProgressStore.publish({
                  status: 'loading',
                  data: {
                    downloaded,
                    successes: progress.successes,
                    failures: progress.failures,
                    total: progress.total,
                  },
                });
              },
            });
            backupProgressStore.publish({ status: 'done' });
            await refreshBackupStatus();
            return { ok: true, value: undefined };
          } catch (error) {
            backupProgressStore.publish({ status: 'idle' });
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        async decodeRecoveryKey(keyId, input) {
          const decodeLifecycle = secretStorageLifecycle;
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          try {
            const info = client
              .getAccountData(`m.secret_storage.key.${keyId}`)
              ?.getContent<Record<string, unknown>>();
            if (!info) {
              return { ok: false, error: new CoreError('not-found', 'Unknown secret storage key') };
            }
            let decoded: Uint8Array;
            if (input.recoveryKey !== undefined) {
              decoded = decodeRecoveryKey(input.recoveryKey);
            } else if (input.passphrase !== undefined) {
              const passphrase = info.passphrase as
                | { salt?: string; iterations?: number; bits?: number }
                | undefined;
              if (!passphrase?.salt || !passphrase.iterations) {
                return {
                  ok: false,
                  error: new CoreError('invalid-request', 'Secret storage key has no passphrase'),
                };
              }
              decoded = await deriveRecoveryKeyFromPassphrase(
                input.passphrase,
                passphrase.salt,
                passphrase.iterations,
                passphrase.bits
              );
            } else {
              return {
                ok: false,
                error: new CoreError('invalid-request', 'No recovery input provided'),
              };
            }
            const matches = await client.secretStorage.checkKey(decoded, info as never);
            if (!matches) {
              return { ok: false, error: new CoreError('unauthorized', 'Invalid recovery key.') };
            }
            if (decodeLifecycle !== secretStorageLifecycle) {
              return {
                ok: false,
                error: new CoreError(
                  'cancelled',
                  'Session changed before the key was cached',
                  false
                ),
              };
            }
            await secretStorageKeys.set(keyId, decoded);
            return { ok: true, value: undefined };
          } catch (error) {
            return {
              ok: false,
              error: normalizeSecretError(error, [input.recoveryKey ?? '', input.passphrase ?? '']),
            };
          }
        },
        async requestKey(roomId, eventId) {
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          const room = client.getRoom(roomId);
          const event = room?.findEventById(eventId);
          if (!event) {
            return { ok: false, error: new CoreError('not-found', `Unknown event ${eventId}`) };
          }
          const lastSentAt = keyRequestSentAt.get(eventId);
          if (lastSentAt && Date.now() - lastSentAt < 60_000) {
            return { ok: true, value: undefined };
          }
          const wire = event.getWireContent() as {
            algorithm?: string;
            room_id?: string;
            sender_key?: string;
            session_id?: string;
          };
          const senderId = event.getSender();
          if (!senderId || !wire.algorithm || !wire.sender_key || !wire.session_id) {
            return { ok: false, error: new CoreError('unsupported', 'Event has no key metadata') };
          }
          const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
          const body = {
            algorithm: wire.algorithm,
            room_id: wire.room_id ?? roomId,
            sender_key: wire.sender_key,
            session_id: wire.session_id,
          };
          const contentMap: Record<string, Record<string, Record<string, unknown>>> = {};
          event.getKeyRequestRecipients(senderId).forEach((recipient) => {
            const deviceMap = contentMap[recipient.userId] ?? {};
            deviceMap[recipient.deviceId] = { action: 'request', request_id: requestId, body };
            contentMap[recipient.userId] = deviceMap;
          });
          try {
            await client.sendToDevice(EventType.RoomKeyRequest, contentMap as never);
            keyRequestSentAt.set(eventId, Date.now());
            return { ok: true, value: undefined };
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        async retryDecryption() {
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          const retryable = new Set([
            'MEGOLM_UNKNOWN_INBOUND_SESSION_ID',
            'HISTORICAL_MESSAGE_WORKING_BACKUP',
          ]);
          const events = client.getRooms().flatMap((room) =>
            room
              .getLiveTimeline()
              .getEvents()
              .filter(
                (event) =>
                  event.isDecryptionFailure() &&
                  retryable.has(String(event.decryptionFailureReason ?? ''))
              )
          );
          const results = await Promise.allSettled(
            events.map((event) => event.attemptDecryption(crypto as never, { isRetry: true }))
          );
          const failed = results.some((result) => result.status === 'rejected');
          if (failed)
            return { ok: false, error: new CoreError('unknown', 'Decryption retry failed') };
          return { ok: true, value: undefined };
        },
        async unlockSecretStorage() {
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          try {
            await crypto.bootstrapCrossSigning({});
            await crypto.bootstrapSecretStorage({});
            await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
            await refreshBackupStatus();
            return { ok: true, value: undefined };
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        async prepareAndRestore() {
          const crypto = client.getCrypto();
          if (!crypto)
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          try {
            await crypto.bootstrapSecretStorage({});
            await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
            return await this.restore();
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        onDecryptionKeyCached(listener) {
          backupKeyCachedListeners.add(listener);
          return () => backupKeyCachedListeners.delete(listener);
        },
      },
      verification: {
        incoming: incomingVerificationStore,
        async request(deviceId) {
          const crypto = client.getCrypto();
          if (!crypto) {
            return { ok: false, error: new CoreError('unsupported', 'Crypto is not available') };
          }
          try {
            const request = await crypto.requestDeviceVerification(
              client.getSafeUserId(),
              deviceId
            );
            return {
              ok: true,
              value: buildVerificationView(registerVerification(request), request),
            };
          } catch (error) {
            return { ok: false, error: normalizeMatrixError(error) };
          }
        },
        view(id) {
          const existing = verificationStores.get(id);
          if (existing) return existing;
          const store = createSnapshotStore<VerificationRequestView | null>(null);
          verificationStores.set(id, store);
          return store;
        },
        accept(id) {
          return runVerificationCommand(id, (request) => request.accept());
        },
        cancel(id) {
          return runVerificationCommand(id, (request) => request.cancel());
        },
        startSas(id) {
          return runVerificationCommand(id, async (request) => {
            await request.startVerification(VerificationMethod.Sas);
          });
        },
        confirmSas(id) {
          const found = verificationById(id);
          if (!found.ok) return Promise.resolve(found);
          const sasCallbacks = attachedSasCallbacks.get(id);
          if (!sasCallbacks) {
            return Promise.resolve({
              ok: false,
              error: new CoreError('unsupported', 'SAS is not available'),
            });
          }
          return runVerificationCommand(id, () => sasCallbacks.confirm());
        },
        async mismatchSas(id) {
          const found = verificationById(id);
          if (!found.ok) return found;
          const sasCallbacks = attachedSasCallbacks.get(id);
          if (!sasCallbacks) {
            return { ok: false, error: new CoreError('unsupported', 'SAS is not available') };
          }
          sasCallbacks.mismatch();
          return { ok: true, value: undefined };
        },
      },
      trust(userId, deviceId) {
        const key = trustKey(userId, deviceId);
        const existing = trustStores.get(key);
        if (existing) return existing;
        const store = createSnapshotStore<DeviceTrust>('unknown');
        trustStores.set(key, store);
        publishTrust(userId, deviceId).catch(() => undefined);
        return store;
      },
      unverifiedCount(userId, deviceIds) {
        const key = countKey(userId, deviceIds);
        const existing = unverifiedCountStores.get(key);
        if (existing) return existing;
        const store = createSnapshotStore<number | undefined>(undefined);
        unverifiedCountStores.set(key, store);
        deviceIds.forEach((deviceId) => {
          if (!trustStores.has(trustKey(userId, deviceId))) {
            publishTrust(userId, deviceId).catch(() => undefined);
          }
        });
        store.publish(0);
        return store;
      },
      async renameDevice(deviceId, displayName) {
        try {
          await client.setDeviceDetails(deviceId, { display_name: displayName });
          return await refreshDevices();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async deleteDevices(deviceIds, auth) {
        try {
          await client.deleteMultipleDevices([...deviceIds], auth as never);
          return await refreshDevices();
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
    },
    send: {
      async sendMessage(roomId, content): Promise<CoreResult<string>> {
        return sendWithTxn(roomId, (txnId) =>
          client.sendMessage(roomId, null as never, content as never, txnId)
        );
      },
      async sendEvent(roomId, eventType, content): Promise<CoreResult<string>> {
        return sendWithTxn(roomId, (txnId) =>
          client.sendEvent(roomId, null as never, eventType as never, content as never, txnId)
        );
      },
      async edit(roomId, eventId, content): Promise<CoreResult<string>> {
        const body = typeof content.body === 'string' ? content.body : '';
        const wrapped: JsonObject = {
          msgtype: typeof content.msgtype === 'string' ? content.msgtype : 'm.text',
          body: `* ${body}`,
          'm.new_content': content,
          'm.relates_to': { rel_type: 'm.replace', event_id: eventId },
        };
        return sendWithTxn(roomId, (txnId) =>
          client.sendEvent(
            roomId,
            null as never,
            'm.room.message' as never,
            wrapped as never,
            txnId
          )
        );
      },
      async reaction(roomId, eventId, key, shortcode): Promise<CoreResult<string>> {
        const wrapped: JsonObject = {
          'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key },
          ...(shortcode !== undefined ? { shortcode } : {}),
        };
        return sendWithTxn(roomId, (txnId) =>
          client.sendEvent(roomId, null as never, 'm.reaction' as never, wrapped as never, txnId)
        );
      },
      async redact(roomId, eventId, reason): Promise<CoreResult<string>> {
        return sendWithTxn(roomId, (txnId) =>
          client.redactEvent(roomId, null as never, eventId, txnId, {
            reason: reason ?? '',
          } as never)
        );
      },
      async cancel(localId) {
        const found = pendingEventOf(localId);
        if (!found) {
          return {
            ok: false,
            error: new CoreError('not-found', `Unknown pending event ${localId}`),
          };
        }
        try {
          client.cancelPendingEvent(found.event);
          publishSendStatus(localId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      async resend(localId) {
        const found = pendingEventOf(localId);
        if (!found) {
          return {
            ok: false,
            error: new CoreError('not-found', `Unknown pending event ${localId}`),
          };
        }
        try {
          await client.resendEvent(found.event, found.room);
          publishSendStatus(localId);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      status(localId) {
        const existing = sendStores.get(localId);
        if (existing) return existing;
        const store = createSnapshotStore<SendStatusView | null>(null);
        sendStores.set(localId, store);
        publishSendStatus(localId);
        return store;
      },
    },
    uploads: {
      start(input) {
        uploadCounter += 1;
        const localId = `harrier-upload-${uploadCounter}`;
        const store = createSnapshotStore<UploadView | null>({
          localId,
          filename: input.filename,
          status: 'uploading',
          loaded: 0,
          total: input.data.byteLength,
        });
        uploadStores.set(localId, store);
        const publish = (view: UploadView | null) => store.publish(view);
        const file = new Blob([input.data], {
          type: input.contentType ?? 'application/octet-stream',
        });
        const promise = client.uploadContent(file, {
          name: input.filename,
          type: input.contentType ?? 'application/octet-stream',
          progressHandler: (progress) => {
            const current = store.getSnapshot().value;
            if (current && current.status === 'uploading') {
              publish({ ...current, loaded: progress.loaded, total: progress.total });
            }
          },
        });
        uploadPromises.set(localId, promise);
        const forget = () => {
          uploadPromises.delete(localId);
        };
        promise
          .then((response) => {
            forget();
            const mxc = response.content_uri;
            const current = store.getSnapshot().value;
            if (current) {
              publish({
                ...current,
                status: 'done',
                loaded: current.total,
                ...(mxc ? { mxc } : {}),
              });
            }
          })
          .catch((error: unknown) => {
            forget();
            const current = store.getSnapshot().value;
            if (current && current.status === 'uploading') {
              publish({
                ...current,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Upload failed',
              });
            }
          });
        return { ok: true, value: localId };
      },
      async cancel(localId) {
        const promise = uploadPromises.get(localId);
        if (!promise) {
          return { ok: false, error: new CoreError('not-found', `Unknown upload ${localId}`) };
        }
        try {
          await client.cancelUpload(promise);
          uploadPromises.delete(localId);
          uploadStores.get(localId)?.publish(null);
          return { ok: true, value: undefined };
        } catch (error) {
          return { ok: false, error: normalizeMatrixError(error) };
        }
      },
      status(localId) {
        const existing = uploadStores.get(localId);
        if (existing) return existing;
        const store = createSnapshotStore<UploadView | null>(null);
        uploadStores.set(localId, store);
        return store;
      },
    },
  };
  registerMatrixClient(core, client);
  associateMatrixJsCoreSecretStorage(core, secretStorageKeys, resetSecretStorageLifecycle);
  return core;
}
