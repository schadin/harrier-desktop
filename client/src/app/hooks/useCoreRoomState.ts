import type { HarrierCore, JsonObject, RoomStateEntry, SnapshotStore } from '@harrier/core';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
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

export function useCoreRoomStateList(room: Room, eventType: string): readonly RoomStateEntry[] {
  const core = useCore();
  const store = useMemo(
    () => core.rooms.stateList(room.roomId, eventType),
    [core, room.roomId, eventType]
  );
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useCoreRoomsStateList(
  rooms: readonly Room[],
  eventType: string
): ReadonlyMap<string, readonly RoomStateEntry[]> {
  const core = useCore();
  const roomIdsKey = rooms
    .map((room) => room.roomId)
    .sort()
    .join('|');
  const stores = useMemo(() => {
    const map = new Map<string, SnapshotStore<readonly RoomStateEntry[]>>();
    rooms.forEach((room) => {
      map.set(room.roomId, core.rooms.stateList(room.roomId, eventType));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roomIdsKey covers rooms identity for our usage
  }, [core, eventType, roomIdsKey]);

  const cacheRef = useRef<{
    revision: number;
    value: ReadonlyMap<string, readonly RoomStateEntry[]>;
  }>({
    revision: -1,
    value: new Map(),
  });

  const getSnapshot = useCallback(() => {
    let revision = 0;
    stores.forEach((store) => {
      revision += store.getSnapshot().revision;
    });
    if (revision !== cacheRef.current.revision) {
      const value = new Map<string, readonly RoomStateEntry[]>();
      stores.forEach((store, roomId) => {
        value.set(roomId, store.getSnapshot().value);
      });
      cacheRef.current = { revision, value };
    }
    return cacheRef.current.value;
  }, [stores]);

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribes = [...stores.values()].map((store) => store.subscribe(listener));
      return () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      };
    },
    [stores]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
