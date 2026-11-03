import type { JsonObject } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Room } from 'matrix-js-sdk';
import { useCore } from './useCore';

export function useCoreRoomState<T = JsonObject>(
  room: Room,
  eventType: string,
  stateKey = ''
): T | null {
  const core = useCore();
  const store = useMemo(
    () => core.rooms.state(room.roomId, eventType, stateKey),
    [core, room.roomId, eventType, stateKey]
  );
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot) as T | null;
}
