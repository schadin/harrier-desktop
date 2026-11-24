import { useMemo, useSyncExternalStore } from 'react';
import { Membership } from '../../types/matrix/room';
import { useCore } from './useCore';

export const useMembership = (room: { roomId: string }, userId: string): Membership => {
  const core = useCore();
  const store = useMemo(() => core.rooms.members(room.roomId), [core, room.roomId]);
  const members = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  return (members.find((member) => member.userId === userId)?.membership ??
    Membership.Leave) as Membership;
};
