import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export type LocalRoomSummary = {
  roomId: string;
  name: string;
  topic?: string;
  avatarUrl?: string;
  canonicalAlias?: string;
  worldReadable?: boolean;
  guestCanJoin?: boolean;
  memberCount?: number;
  roomType?: string;
  joinRule?: string;
};
export const useLocalRoomSummary = (room: { roomId: string }): LocalRoomSummary => {
  const core = useCore();
  const store = useMemo(() => core.rooms.room(room.roomId), [core, room.roomId]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  return {
    roomId: room.roomId,
    name: view?.name ?? room.roomId,
    topic: view?.topic,
    avatarUrl: view?.avatarMxc,
    canonicalAlias: view?.canonicalAlias,
    worldReadable: view?.historyVisibility
      ? view.historyVisibility === 'world_readable'
      : undefined,
    guestCanJoin: view?.guestCanJoin,
    memberCount: view?.memberCount,
    roomType: view?.roomType,
    joinRule: view?.joinRule,
  };
};
