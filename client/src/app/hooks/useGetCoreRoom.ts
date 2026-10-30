import type { RoomView } from '@harrier/core';
import { useCallback } from 'react';
import { useCore } from './useCore';

export type GetCoreRoomCallback = (roomId: string) => RoomView | null;

export const useGetCoreRoom = (rooms: Set<string>): GetCoreRoomCallback => {
  const core = useCore();

  return useCallback(
    (roomId: string) => (rooms.has(roomId) ? core.rooms.room(roomId).getSnapshot().value : null),
    [core, rooms]
  );
};
