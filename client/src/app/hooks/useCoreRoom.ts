import type { RoomView } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export function useCoreRoom(roomId: string): RoomView | null {
  const core = useCore();
  const store = useMemo(() => core.rooms.room(roomId), [core, roomId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
}
