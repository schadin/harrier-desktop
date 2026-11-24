import type { HarrierCore } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useRoomCreators = (room: { roomId: string }): Set<string> => {
  const core = useCore();
  const store = useMemo(() => core.rooms.creators(room.roomId), [core, room.roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  const creators = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);

  return useMemo(() => new Set(creators), [creators]);
};

export const getRoomCreatorsForRoomId = (core: HarrierCore, roomId: string): Set<string> =>
  new Set(core.rooms.creators(roomId).getSnapshot().value);
