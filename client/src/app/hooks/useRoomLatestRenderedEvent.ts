/* eslint-disable no-continue */
import type { TimelineItem } from '@harrier/core';
import { useMemo } from 'react';
import type { Room as MatrixRoom } from 'matrix-js-sdk';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { StateEvent } from '../../types/matrix/room';
import { isVisibleTimelineItem } from '../utils/timelineVisibility';
import { useCoreTimeline } from './useCoreTimeline';

export const useRoomLatestRenderedEvent = (room: MatrixRoom): TimelineItem | undefined => {
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const timeline = useCoreTimeline(room.roomId);

  return useMemo(() => {
    for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
      const item = timeline.items[index];
      if (!item?.eventId) continue;
      if (item.kind === 'state' && item.eventType === StateEvent.RoomMember) {
        const membershipChanged = item.content.membership !== item.prevContent?.membership;
        if (membershipChanged && hideMembershipEvents) continue;
        if (!membershipChanged && hideNickAvatarEvents) continue;
        return item;
      }
      if (
        item.kind === 'message' ||
        item.kind === 'encrypted' ||
        item.kind === 'sticker' ||
        (item.kind === 'state' && item.eventType === StateEvent.RoomName) ||
        (item.kind === 'state' && item.eventType === StateEvent.RoomTopic) ||
        (item.kind === 'state' && item.eventType === StateEvent.RoomAvatar)
      ) {
        return item;
      }
      if (
        showHiddenEvents &&
        isVisibleTimelineItem(item, {
          hideMembershipEvents,
          hideNickAvatarEvents,
          showHiddenEvents,
          ignoredUsers: new Set(),
        })
      ) {
        return item;
      }
    }
    return undefined;
  }, [timeline.items, hideMembershipEvents, hideNickAvatarEvents, showHiddenEvents]);
};
