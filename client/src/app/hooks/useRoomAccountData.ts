import { Room } from 'matrix-js-sdk';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useRoomAccountData = (room: Room): Map<string, object> => {
  const core = useCore();
  const store = useMemo(() => core.rooms.accountData(room.roomId), [core, room.roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  const entries = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);

  return useMemo(() => new Map(entries.map((entry) => [entry.type, entry.content])), [entries]);
};
