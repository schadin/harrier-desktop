import type { RoomView } from '@harrier/core';
import { useMemo } from 'react';
import { getAllParents } from '../utils/room';
import { useCore } from './useCore';

export const useImagePackRooms = (
  roomId: string,
  roomToParents: Map<string, Set<string>>
): RoomView[] => {
  const core = useCore();

  return useMemo(() => {
    const allParentSpaces = [roomId].concat(Array.from(getAllParents(roomToParents, roomId)));
    return allParentSpaces
      .map((id) => core.rooms.room(id).getSnapshot().value)
      .filter((room): room is RoomView => !!room);
  }, [core, roomId, roomToParents]);
};
