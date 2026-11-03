import type { MemberView } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useRoomMembers = (roomId: string): readonly MemberView[] => {
  const core = useCore();
  const store = useMemo(() => core.rooms.members(roomId), [core, roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};
