import type { RoomStateEntry } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useStateEvent = (
  room: { roomId: string },
  eventType: string,
  stateKey = ''
): RoomStateEntry | null => {
  const core = useCore();
  const store = useMemo(
    () => core.rooms.stateEntry(room.roomId, eventType, stateKey),
    [core, room.roomId, eventType, stateKey]
  );
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};
