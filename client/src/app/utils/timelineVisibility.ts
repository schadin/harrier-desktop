import type { TimelineItem } from '@harrier/core';
import { StateEvent } from '../../types/matrix/room';
import { isMembershipContentChanged } from './room';

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
