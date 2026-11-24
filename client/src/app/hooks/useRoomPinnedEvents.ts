import { useMemo } from 'react';
import type { RoomPinnedEventsEventContent } from '../../types/matrix/protocol';
import { StateEvent } from '../../types/matrix/room';
import { useCoreRoomState } from './useCoreRoomState';

export const useRoomPinnedEvents = (room: { roomId: string }): string[] => {
  const content = useCoreRoomState<RoomPinnedEventsEventContent>(
    room as Parameters<typeof useCoreRoomState>[0],
    StateEvent.RoomPinnedEvents
  );
  const events = useMemo(() => content?.pinned ?? [], [content]);

  return events;
};
