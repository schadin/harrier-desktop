import { useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { isRoomAlias } from '../../utils/matrix';
import { getCanonicalAliasRoomIdWithTombstoneFallback } from '../../utils/coreRoomNavigation';
import { useCore } from '../useCore';
import { useCoreRoomNavigationRevision } from '../useCoreRoomNavigation';

export const useSelectedRoom = (): string | undefined => {
  const core = useCore();
  const rooms = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  ).value;
  useCoreRoomNavigationRevision();
  const { roomIdOrAlias } = useParams();
  if (!roomIdOrAlias || !isRoomAlias(roomIdOrAlias)) return roomIdOrAlias;
  const aliasedRoomId = getCanonicalAliasRoomIdWithTombstoneFallback(core, roomIdOrAlias);
  return aliasedRoomId && rooms.some((room) => room.roomId === aliasedRoomId)
    ? aliasedRoomId
    : roomIdOrAlias;
};
