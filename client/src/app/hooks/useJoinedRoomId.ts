import { useMemo } from 'react';
import { resolveJoinedRoomId } from '../utils/coreRoomNavigation';
import { useCore } from './useCore';

export const useJoinedRoomId = (
  allRooms: readonly string[],
  roomIdOrAlias: string
): string | undefined => {
  const core = useCore();

  return useMemo(
    () => resolveJoinedRoomId(core, allRooms, roomIdOrAlias),
    [core, allRooms, roomIdOrAlias]
  );
};
