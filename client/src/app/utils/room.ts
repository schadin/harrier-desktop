import { IconName, IconSrc } from 'folds';

import type { TimelineItem } from '@harrier/core';
import { AccountDataEvent } from '../../types/matrix/accountData';
import {
  EventTimelineDirection,
  EventTimelineLike,
  EventTimelineSetLike,
  EventType,
  IMentions,
  IPowerLevelsContent,
  JoinRule,
  MatrixClientLike,
  MatrixEventLike,
  NotificationCountType,
  RelationType,
  RoomLike,
  RoomMemberLike,
} from '../../types/matrix/legacyStructural';
import { MsgType } from '../../types/matrix/protocol';
import { IPushRule, IPushRules } from '../../types/matrix/pushRules';
import {
  IRoomCreateContent,
  Membership,
  NotificationType,
  RoomToParents,
  RoomType,
  StateEvent,
  UnreadInfo,
} from '../../types/matrix/room';

type EventFromRoomState<S> = S extends {
  getStateEvents(eventType: string, stateKey: string): infer E;
}
  ? NonNullable<E> extends MatrixEventLike
    ? NonNullable<E>
    : never
  : never;

type RoomEvent<R extends RoomLike> = EventFromRoomState<
  NonNullable<ReturnType<ReturnType<R['getLiveTimeline']>['getState']>>
>;

type EventFromRelations<R> = R extends { getRelations(): infer E }
  ? E extends MatrixEventLike[]
    ? E[number]
    : never
  : never;

type TimelineSetEvent<T extends EventTimelineSetLike> = EventFromRelations<
  ReturnType<T['relations']['getChildEventsForEvent']>
>;

export const getStateEvent = <R extends RoomLike>(
  room: R,
  eventType: StateEvent,
  stateKey = ''
): RoomEvent<R> | undefined =>
  (room
    .getLiveTimeline()
    .getState(EventTimelineDirection.FORWARDS)
    ?.getStateEvents(eventType, stateKey) ?? undefined) as RoomEvent<R> | undefined;

export const getStateEvents = <R extends RoomLike>(
  room: R,
  eventType: StateEvent
): RoomEvent<R>[] =>
  (room.getLiveTimeline().getState(EventTimelineDirection.FORWARDS)?.getStateEvents(eventType) ??
    []) as RoomEvent<R>[];

export const getAccountData = <M extends MatrixClientLike>(
  mx: M,
  eventType: AccountDataEvent
): ReturnType<M['getAccountData']> =>
  mx.getAccountData(eventType) as ReturnType<M['getAccountData']>;

export const getMDirects = (mDirectEvent: MatrixEventLike): Set<string> => {
  const roomIds = new Set<string>();
  const userIdToDirects = mDirectEvent?.getContent();

  if (userIdToDirects === undefined) return roomIds;

  Object.keys(userIdToDirects).forEach((userId) => {
    const directs = userIdToDirects[userId];
    if (Array.isArray(directs)) {
      directs.forEach((id) => {
        if (typeof id === 'string') roomIds.add(id);
      });
    }
  });

  return roomIds;
};

export const isDirectInvite = (room: RoomLike | null, myUserId: string | null): boolean => {
  if (!room || !myUserId) return false;
  const me = room.getMember(myUserId);
  const memberEvent = me?.events?.member;
  const content = memberEvent?.getContent();
  return content?.is_direct === true;
};

export const isSpace = (room: RoomLike | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: RoomLike | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: RoomLike | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true; // Consider room unsupported if m.room.create event doesn't exist
  return event.getContent().type !== undefined && event.getContent().type !== RoomType.Space;
};

export function isValidChild(mEvent: MatrixEventLike): boolean {
  return (
    mEvent.getType() === StateEvent.SpaceChild &&
    Array.isArray(mEvent.getContent<{ via: string[] }>().via)
  );
}

export const getAllParents = (roomToParents: RoomToParents, roomId: string): Set<string> => {
  const allParents = new Set<string>();

  const addAllParentIds = (rId: string) => {
    if (allParents.has(rId)) return;
    allParents.add(rId);

    const parents = roomToParents.get(rId);
    parents?.forEach((id) => addAllParentIds(id));
  };
  addAllParentIds(roomId);
  allParents.delete(roomId);
  return allParents;
};

export const getSpaceChildren = (room: RoomLike) =>
  getStateEvents(room, StateEvent.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

export const mapParentWithChildren = (
  roomToParents: RoomToParents,
  roomId: string,
  children: string[]
) => {
  const allParents = getAllParents(roomToParents, roomId);
  children.forEach((childId) => {
    if (allParents.has(childId)) {
      // Space cycle detected.
      return;
    }
    const parents = roomToParents.get(childId) ?? new Set<string>();
    parents.add(roomId);
    roomToParents.set(childId, parents);
  });
};

export const getRoomToParents = (mx: MatrixClientLike): RoomToParents => {
  const map: RoomToParents = new Map();
  mx.getRooms()
    .filter((room) => isSpace(room))
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  const orphanParents = Array.from(parents).filter(
    (parentRoomId) => !roomToParents.has(parentRoomId)
  );

  return orphanParents;
};

export const isMutedRule = (rule: IPushRule) =>
  // Check for empty actions (new spec) or dont_notify (deprecated)
  (rule.actions.length === 0 || rule.actions[0] === 'dont_notify') &&
  rule.conditions?.[0]?.kind === 'event_match';

export const findMutedRule = (overrideRules: IPushRule[], roomId: string) =>
  overrideRules.find((rule) => rule.rule_id === roomId && isMutedRule(rule));

export const getNotificationType = (mx: MatrixClientLike, roomId: string): NotificationType => {
  let roomPushRule: IPushRule | undefined;
  try {
    roomPushRule = mx.getRoomPushRule('global', roomId);
  } catch {
    roomPushRule = undefined;
  }

  if (!roomPushRule) {
    const overrideRules = mx.getAccountData(AccountDataEvent.PushRules)?.getContent<IPushRules>()
      ?.global?.override;
    if (!overrideRules) return NotificationType.Default;

    return findMutedRule(overrideRules, roomId) ? NotificationType.Mute : NotificationType.Default;
  }

  if (roomPushRule.actions[0] === 'notify') return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

const NOTIFICATION_EVENT_TYPES = [
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.room.member',
  'm.sticker',
];
export const isNotificationEvent = (mEvent: MatrixEventLike) => {
  const eType = mEvent.getType();
  if (!NOTIFICATION_EVENT_TYPES.includes(eType)) {
    return false;
  }
  if (eType === 'm.room.member') return false;

  if (mEvent.isRedacted()) return false;
  if (mEvent.getRelation()?.rel_type === 'm.replace') return false;

  return true;
};

export const roomHaveNotification = (room: RoomLike): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);

  return total > 0 || highlight > 0;
};

export const roomHaveUnread = (mx: MatrixClientLike, room: RoomLike) => {
  const userId = mx.getUserId();
  if (!userId) return false;
  const readUpToId = room.getEventReadUpTo(userId);
  const liveEvents = room.getLiveTimeline().getEvents();

  if (liveEvents[liveEvents.length - 1]?.getSender() === userId) {
    return false;
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (event.getId() === readUpToId) return false;
    if (isNotificationEvent(event)) return true;
  }
  return true;
};

export const roomIsUnread = (mx: MatrixClientLike, room: RoomLike): boolean => {
  if (room.getLiveTimeline().getEvents().length === 0) {
    return roomHaveNotification(room);
  }
  return roomHaveUnread(mx, room);
};

export const getUnreadInfo = (room: RoomLike): UnreadInfo => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
  return {
    roomId: room.roomId,
    highlight,
    total: highlight > total ? highlight : total,
  };
};

export const getUnreadInfos = (mx: MatrixClientLike): UnreadInfo[] => {
  const unreadInfos = mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom()) return unread;
    if (room.getMyMembership() !== 'join') return unread;
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return unread;

    if (roomIsUnread(mx, room)) {
      unread.push(getUnreadInfo(room));
    }

    return unread;
  }, []);
  return unreadInfos;
};

export const getRoomIconSrc = (
  icons: Record<IconName, IconSrc>,
  roomType?: string,
  joinRule?: string
): IconSrc => {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return icons.SpaceGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.SpaceLock;
    }
    return icons.Space;
  }

  if (roomType === RoomType.Call) {
    if (joinRule === JoinRule.Public) return icons.VolumeHighGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.VolumeHighLock;
    }
    return icons.VolumeHigh;
  }

  if (joinRule === JoinRule.Public) return icons.HashGlobe;
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return icons.HashLock;
  }
  return icons.Hash;
};

export const getRoomAvatarUrl = (
  mx: MatrixClientLike,
  room: RoomLike,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getMxcAvatarUrl();
  return mxcUrl
    ? mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
    : undefined;
};

export const getDirectRoomAvatarUrl = (
  mx: MatrixClientLike,
  room: RoomLike,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getAvatarFallbackMember()?.getMxcAvatarUrl();

  if (!mxcUrl) {
    return getRoomAvatarUrl(mx, room, size, useAuthentication);
  }

  return (
    mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
  );
};

export const trimReplyFromBody = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const trimReplyFromFormattedBody = (formattedBody: string): string => {
  const suffix = '</mx-reply>';
  const i = formattedBody.lastIndexOf(suffix);
  if (i < 0) {
    return formattedBody;
  }
  return formattedBody.slice(i + suffix.length);
};

export const parseReplyBody = (userId: string, body: string) =>
  `> <${userId}> ${body.replace(/\n/g, '\n> ')}\n\n`;

export const parseReplyFormattedBody = (
  roomId: string,
  userId: string,
  eventId: string,
  formattedBody: string
): string => {
  const replyToLink = `<a href="https://matrix.to/#/${encodeURIComponent(
    roomId
  )}/${encodeURIComponent(eventId)}">In reply to</a>`;
  const userLink = `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${userId}</a>`;

  return `<mx-reply><blockquote>${replyToLink}${userLink}<br />${formattedBody}</blockquote></mx-reply>`;
};

export const getMemberDisplayName = (room: RoomLike, userId: string): string | undefined => {
  const member = room.getMember(userId);
  const name = member?.rawDisplayName;
  if (name === userId) return undefined;
  return name;
};

export const getMemberSearchStr = (
  member: RoomMemberLike,
  query: string,
  mxIdToName: (mxId: string) => string
): string[] => [
  member.rawDisplayName === member.userId ? mxIdToName(member.userId) : member.rawDisplayName,
  query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId),
];

export const getMemberAvatarMxc = (room: RoomLike, userId: string): string | undefined => {
  const member = room.getMember(userId);
  return member?.getMxcAvatarUrl();
};

export const isMembershipContentChanged = (
  content: { membership?: unknown; reason?: unknown },
  prevContent: { membership?: unknown; reason?: unknown }
): boolean =>
  content.membership !== prevContent.membership || content.reason !== prevContent.reason;

export const isMembershipChanged = (mEvent: MatrixEventLike): boolean =>
  isMembershipContentChanged(
    mEvent.getContent() as { membership?: unknown; reason?: unknown },
    mEvent.getPrevContent() as { membership?: unknown; reason?: unknown }
  );

export const getReactionContent = (eventId: string, key: string, shortcode?: string) => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: 'm.annotation',
  },
  shortcode,
});

export const getEventReactions = <T extends EventTimelineSetLike>(
  timelineSet: T,
  eventId: string
): ReturnType<T['relations']['getChildEventsForEvent']> =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Annotation,
    EventType.Reaction
  ) as ReturnType<T['relations']['getChildEventsForEvent']>;

export const getEventEdits = <T extends EventTimelineSetLike>(
  timelineSet: T,
  eventId: string,
  eventType: string
): ReturnType<T['relations']['getChildEventsForEvent']> =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Replace,
    eventType
  ) as ReturnType<T['relations']['getChildEventsForEvent']>;

export const getLatestEdit = <E extends MatrixEventLike>(
  targetEvent: MatrixEventLike,
  editEvents: E[]
): E | undefined => {
  const eventByTargetSender = (rEvent: E) => rEvent.getSender() === targetEvent.getSender();
  return editEvents.sort((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = <T extends EventTimelineSetLike>(
  mEventId: string,
  mEvent: MatrixEventLike,
  timelineSet: T
): TimelineSetEvent<T> | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && (getLatestEdit(mEvent, edits.getRelations()) as TimelineSetEvent<T> | undefined);
};

export const canEditItem = (
  mx: MatrixClientLike,
  item: Extract<TimelineItem, { kind: 'message' }>
): boolean =>
  item.sender === mx.getUserId() &&
  (item.replyTo === undefined || item.threadRoot !== undefined) &&
  (item.content.msgtype === MsgType.Text ||
    item.content.msgtype === MsgType.Emote ||
    item.content.msgtype === MsgType.Notice);

export const getLatestEditableEvt = <T extends EventTimelineLike>(
  timeline: T,
  canEdit: (mEvent: ReturnType<T['getEvents']>[number]) => boolean
): ReturnType<T['getEvents']>[number] | undefined => {
  const events = timeline.getEvents();

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i] as ReturnType<T['getEvents']>[number];
    if (canEdit(evt)) return evt;
  }
  return undefined;
};

export const reactionOrEditEvent = (mEvent: MatrixEventLike) =>
  mEvent.getRelation()?.rel_type === RelationType.Annotation ||
  mEvent.getRelation()?.rel_type === RelationType.Replace;

export const getMentionContent = (userIds: string[], room: boolean): IMentions => {
  const mMentions: IMentions = {};
  if (userIds.length > 0) {
    mMentions.user_ids = userIds;
  }
  if (room) {
    mMentions.room = true;
  }

  return mMentions;
};

export const getCommonRooms = (
  mx: MatrixClientLike,
  rooms: string[],
  otherUserId: string
): string[] => {
  const commonRooms: string[] = [];

  rooms.forEach((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return;

    const common = room.hasMembershipState(otherUserId, Membership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (
  mx: MatrixClientLike,
  rooms: string[],
  otherUserId: string
): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return false;

    const banned = room.hasMembershipState(otherUserId, Membership.Ban);
    return banned;
  });

export const getAllVersionsRoomCreator = (room: RoomLike): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, StateEvent.RoomCreate);
  const createContent = createEvent?.getContent<IRoomCreateContent>();
  const creator = createEvent?.getSender();
  if (typeof creator === 'string') creators.add(creator);

  if (createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((c) => {
      if (typeof c === 'string') creators.add(c);
    });
  }

  return creators;
};

export const guessPerfectParent = (
  mx: MatrixClientLike,
  roomId: string,
  parents: string[]
): string | undefined => {
  if (parents.length === 1) {
    return parents[0];
  }

  const getSpecialUsers = (rId: string): string[] => {
    const specialUsers: Set<string> = new Set();

    const r = mx.getRoom(rId);
    if (!r) return [];

    getAllVersionsRoomCreator(r).forEach((c) => specialUsers.add(c));

    const powerLevels = getStateEvent(
      r,
      StateEvent.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId] > defaultPower) {
          specialUsers.add(userId);
        }
      });

    return Array.from(specialUsers);
  };

  let perfectParent: string | undefined;
  let score = 0;

  const roomSpecialUsers = getSpecialUsers(roomId);
  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(parentId);
    const matchedUsersCount = parentSpecialUsers.filter((userId) =>
      roomSpecialUsers.includes(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};
