import type { HarrierCore, JsonObject } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Room } from 'matrix-js-sdk';
import { useCore } from './useCore';

export const sendRoomState = async (
  core: HarrierCore,
  roomId: string,
  eventType: string,
  content: object,
  stateKey?: string
): Promise<void> => {
  const result = await core.rooms.sendState(roomId, eventType, content as JsonObject, stateKey);
  if (!result.ok) throw result.error;
};

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
