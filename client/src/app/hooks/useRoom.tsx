import React, { createContext, ReactNode, useContext, useSyncExternalStore } from 'react';
import type { RoomView } from '@harrier/core';
import { getMatrixClient } from '@harrier/core-matrix-js';
import { useCore } from './useCore';

type LegacyRoom = NonNullable<ReturnType<ReturnType<typeof getMatrixClient>['getRoom']>>;

const RoomIdContext = createContext<string | null>(null);

type RoomProviderProps = {
  value: LegacyRoom | string;
  children: ReactNode;
};
export function RoomProvider({ value, children }: RoomProviderProps) {
  return (
    <RoomIdContext.Provider value={typeof value === 'string' ? value : value.roomId}>
      {children}
    </RoomIdContext.Provider>
  );
}

export function useRoomId(): string {
  const roomId = useContext(RoomIdContext);
  if (!roomId) throw new Error('Room not provided!');
  return roomId;
}

export function useCoreRoomFromContext(): RoomView | null {
  const core = useCore();
  const roomId = useRoomId();
  const store = core.rooms.room(roomId);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
}

export function useRoom(): LegacyRoom {
  const core = useCore();
  const roomId = useRoomId();
  const room = getMatrixClient(core).getRoom(roomId);
  if (!room) throw new Error(`Room ${roomId} not found!`);
  return room;
}

const IsDirectRoomContext = createContext<boolean>(false);

export const IsDirectRoomProvider = IsDirectRoomContext.Provider;

export const useIsDirectRoom = () => {
  const direct = useContext(IsDirectRoomContext);

  return direct;
};
