import type { RoomStateEntry } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export type StateTypeToState = Map<string, readonly RoomStateEntry[]>;

export const useRoomState = (room: { roomId: string }): StateTypeToState => {
  const core = useCore();
  const store = useMemo(() => core.rooms.stateEntries(room.roomId), [core, room.roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  const entries = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);

  return useMemo(() => {
    const state: StateTypeToState = new Map();
    entries.forEach((entry) => {
      if (!entry.eventType) return;
      const list = state.get(entry.eventType) ?? [];
      state.set(entry.eventType, [...list, entry]);
    });
    return state;
  }, [entries]);
};
