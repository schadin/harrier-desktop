import { MatrixEvent } from 'matrix-js-sdk';
import { MessageEvent, StateEvent } from '../../types/matrix/room';
import { isMembershipChanged, reactionOrEditEvent } from './room';

export type TimelineVisibilityOptions = {
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  showHiddenEvents: boolean;
  ignoredUsers: Set<string>;
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
