import { useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { isRoomAlias } from '../../utils/matrix';
import { useCore } from '../useCore';

export const useSelectedRoom = (): string | undefined => {
  const core = useCore();
  const rooms = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  ).value;
  const { roomIdOrAlias } = useParams();
  if (!roomIdOrAlias || !isRoomAlias(roomIdOrAlias)) return roomIdOrAlias;
  return (
    rooms
      .map((room) => core.rooms.room(room.roomId).getSnapshot().value)
      .find((room) => room?.canonicalAlias === roomIdOrAlias)?.roomId ?? roomIdOrAlias
  );
};
