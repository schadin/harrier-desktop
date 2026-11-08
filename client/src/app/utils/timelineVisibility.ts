import { MatrixEvent } from 'matrix-js-sdk';
import type { TimelineItem } from '@harrier/core';
import { MessageEvent, StateEvent } from '../../types/matrix/room';
import { isMembershipContentChanged, isMembershipChanged, reactionOrEditEvent } from './room';

export type TimelineVisibilityOptions = {
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  showHiddenEvents: boolean;
  ignoredUsers: Set<string>;
};

export const isVisibleTimelineItem = (
  item: TimelineItem,
  {
    hideMembershipEvents,
    hideNickAvatarEvents,
    showHiddenEvents,
    ignoredUsers,
  }: TimelineVisibilityOptions
): boolean => {
  if (ignoredUsers.has(item.sender)) return false;

  if (item.kind === 'redacted') return showHiddenEvents;

  switch (item.kind) {
    case 'message':
    case 'encrypted':
    case 'sticker':
      return true;

    case 'state': {
      switch (item.eventType) {
        case StateEvent.RoomMember: {
          const membershipChanged = isMembershipContentChanged(
            item.content,
            item.prevContent ?? {}
          );
          if (membershipChanged && hideMembershipEvents) return false;
          if (!membershipChanged && hideNickAvatarEvents) return false;
          return true;
        }

        case StateEvent.GroupCallMemberPrefix: {
          const callJoined = item.content.application;
          if (callJoined && item.prevContent && 'application' in item.prevContent) return false;
          return true;
        }

        case StateEvent.RoomName:
        case StateEvent.RoomTopic:
        case StateEvent.RoomAvatar:
          return true;

        default:
          return showHiddenEvents;
      }
    }

    case 'unsupported': {
      if (item.eventType === 'm.room.redaction') return false;
      return showHiddenEvents;
    }

    default:
      return false;
  }
};

export const isVisibleTimelineEvent = (
  mEvent: MatrixEvent,
  {
    hideMembershipEvents,
    hideNickAvatarEvents,
    showHiddenEvents,
    ignoredUsers,
  }: TimelineVisibilityOptions
): boolean => {
  const sender = mEvent.getSender();
  if (sender && ignoredUsers.has(sender)) return false;

  if (mEvent.isRedacted() && !showHiddenEvents) return false;

  if (reactionOrEditEvent(mEvent)) return false;

  const type = mEvent.getType();

  switch (type) {
    case MessageEvent.RoomMessage:
    case MessageEvent.RoomMessageEncrypted:
    case MessageEvent.Sticker:
      return true;

    case StateEvent.RoomMember: {
      const membershipChanged = isMembershipChanged(mEvent);
      if (membershipChanged && hideMembershipEvents) return false;
      if (!membershipChanged && hideNickAvatarEvents) return false;
      return true;
    }

    case StateEvent.GroupCallMemberPrefix: {
      const content = mEvent.getContent();
      const prevContent = mEvent.getPrevContent();
      const callJoined = content.application;
      if (callJoined && 'application' in prevContent) return false;
      return true;
    }

    case StateEvent.RoomName:
    case StateEvent.RoomTopic:
    case StateEvent.RoomAvatar:
      return true;

    default:
      if (typeof mEvent.getStateKey() === 'string') return showHiddenEvents;
      if (!showHiddenEvents) return false;
      if (Object.keys(mEvent.getContent()).length === 0) return false;
      if (mEvent.getRelation()) return false;
      if (mEvent.isRedaction()) return false;
      return true;
  }
};
