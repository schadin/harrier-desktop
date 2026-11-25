import { IconName, IconSrc } from 'folds';

import type { HarrierCore, RoomView, TimelineItem } from '@harrier/core';
import { toMediaRef } from './coreMedia';
import {
  EventTimelineDirection,
  EventTimelineSetLike,
  EventType,
  IMentions,
  IPowerLevelsContent,
  JoinRule,
  MatrixClientLike,
  MatrixEventLike,
  RelationType,
  RoomLike,
} from '../../types/matrix/legacyStructural';
import { MsgType } from '../../types/matrix/protocol';
import { IRoomCreateContent, RoomToParents, RoomType, StateEvent } from '../../types/matrix/room';

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

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  const orphanParents = Array.from(parents).filter(
    (parentRoomId) => !roomToParents.has(parentRoomId)
  );

  return orphanParents;
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
  core: HarrierCore,
  room: RoomView,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.avatarMxc;
  return mxcUrl
    ? core.media.url(toMediaRef(mxcUrl, { width: size, height: size, resizeMethod: 'crop' }), {
        useAuthentication,
        allowDirectLinks: false,
        allowRedirects: false,
      }) ?? undefined
    : undefined;
};

export const getDirectRoomAvatarUrl = (
  core: HarrierCore,
  room: RoomView,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.dmAvatarMxc;

  if (!mxcUrl) {
    return getRoomAvatarUrl(core, room, size, useAuthentication);
  }

  return (
    core.media.url(toMediaRef(mxcUrl, { width: size, height: size, resizeMethod: 'crop' }), {
      useAuthentication,
      allowDirectLinks: false,
      allowRedirects: false,
    }) ?? undefined
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
