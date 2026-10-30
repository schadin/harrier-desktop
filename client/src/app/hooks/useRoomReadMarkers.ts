import { Room, RoomEvent, RoomEventHandlerMap } from 'matrix-js-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useIgnoredUsers } from './useIgnoredUsers';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { isVisibleTimelineEvent } from '../utils/timelineVisibility';

export const useRoomReadMarkers = (room: Room): Map<string, string[]> => {
  const mx = useMatrixClient();
  const [hideMembershipEvents] = useSetting(settingsAtom, 'hideMembershipEvents');
  const [hideNickAvatarEvents] = useSetting(settingsAtom, 'hideNickAvatarEvents');
  const [showHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');
  const ignoredUsersList = useIgnoredUsers();
  const ignoredUsers = useMemo(() => new Set(ignoredUsersList), [ignoredUsersList]);

  const compute = useCallback(() => {
    const liveEvents = room.getLiveTimeline().getEvents();
    const myUserId = mx.getUserId();

    const readersByEvent = new Map<string, string[]>();
    let lastVisibleEventId: string | undefined;

    liveEvents.forEach((mEvent) => {
      const eventId = mEvent.getId();
      if (!eventId) return;

      if (
        isVisibleTimelineEvent(mEvent, {
          hideMembershipEvents,
          hideNickAvatarEvents,
          showHiddenEvents,
          ignoredUsers,
        })
      ) {
        lastVisibleEventId = eventId;
      }

      const readers = room.getUsersReadUpTo(mEvent);
      if (readers.length === 0 || !lastVisibleEventId) return;

      const anchorReaders = readersByEvent.get(lastVisibleEventId) ?? [];
      readers.forEach((userId) => {
        if (userId === myUserId) return;
        if (!anchorReaders.includes(userId)) anchorReaders.push(userId);
      });
      if (anchorReaders.length > 0) readersByEvent.set(lastVisibleEventId, anchorReaders);
    });

    return readersByEvent;
  }, [room, mx, hideMembershipEvents, hideNickAvatarEvents, showHiddenEvents, ignoredUsers]);

  const [markers, setMarkers] = useState<Map<string, string[]>>(() => compute());

  useEffect(() => {
    setMarkers(compute());

    const handleReceipt: RoomEventHandlerMap[RoomEvent.Receipt] = () => {
      setMarkers(compute());
    };
    const handleTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = () => {
      setMarkers(compute());
    };

    room.on(RoomEvent.Receipt, handleReceipt);
    room.on(RoomEvent.Timeline, handleTimeline);
    return () => {
      room.removeListener(RoomEvent.Receipt, handleReceipt);
      room.removeListener(RoomEvent.Timeline, handleTimeline);
    };
  }, [room, compute]);

  return markers;
};
