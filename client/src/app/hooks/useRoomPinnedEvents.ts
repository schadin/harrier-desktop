import { useMemo } from 'react';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import { Room } from 'matrix-js-sdk';
import { StateEvent } from '../../types/matrix/room';
import { useCoreRoomState } from './useCoreRoomState';

export const useRoomPinnedEvents = (room: Room): string[] => {
  const content = useCoreRoomState<RoomPinnedEventsEventContent>(room, StateEvent.RoomPinnedEvents);
  const events = useMemo(() => content?.pinned ?? [], [content]);

  return events;
};
