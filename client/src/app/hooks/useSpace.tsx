import type { RoomView } from '@harrier/core';
import { getMatrixClient } from '@harrier/core-matrix-js';
import React, { createContext, ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

type LegacyRoom = NonNullable<ReturnType<ReturnType<typeof getMatrixClient>['getRoom']>>;

const emptySpaceSnapshot = { revision: 0, value: null } as const;
const getEmptySpaceSnapshot = () => emptySpaceSnapshot;
const subscribeToNothing = () => () => undefined;

const SpaceIdContext = createContext<string | null>(null);

type SpaceProviderProps = {
  value: LegacyRoom | string | null;
  children: ReactNode;
};
export function SpaceProvider({ value, children }: SpaceProviderProps) {
  return (
    <SpaceIdContext.Provider value={typeof value === 'string' ? value : value?.roomId ?? null}>
      {children}
    </SpaceIdContext.Provider>
  );
}

export function useSpaceId(): string | null {
  return useContext(SpaceIdContext);
}

export function useCoreSpace(): RoomView | null {
  const core = useCore();
  const roomId = useSpaceId();
  const store = useMemo(() => (roomId ? core.rooms.room(roomId) : null), [core, roomId]);
  return useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getSnapshot ?? getEmptySpaceSnapshot,
    store?.getSnapshot ?? getEmptySpaceSnapshot
  ).value;
}

export function useSpace(): LegacyRoom {
  const core = useCore();
  const roomId = useSpaceId();
  if (!roomId) throw new Error('Space not provided!');
  const room = getMatrixClient(core).getRoom(roomId);
  if (!room) throw new Error(`Space ${roomId} not found!`);
  return room;
}

export function useSpaceOptionally(): LegacyRoom | null {
  const core = useCore();
  const roomId = useSpaceId();
  return roomId ? getMatrixClient(core).getRoom(roomId) : null;
}
