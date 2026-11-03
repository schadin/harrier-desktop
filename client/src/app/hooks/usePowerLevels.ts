import { MatrixEvent, Room } from 'matrix-js-sdk';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { fillMissingPowers, readPowerLevel, type IPowerLevels } from '@harrier/core';
import { useCore } from './useCore';

export { readPowerLevel, getPermissionPower, applyPermissionPower } from '@harrier/core';
export type {
  IPowerLevels,
  PermissionLocation,
  PowerLevelActions,
  PowerLevelNotificationsAction,
  ReadPowerLevelAPI,
} from '@harrier/core';

export const getPowersLevelFromMatrixEvent = (mEvent?: MatrixEvent): IPowerLevels => {
  const plContent = mEvent?.getContent<IPowerLevels>();

  return fillMissingPowers(plContent ?? {});
};

const useCorePowerLevelsStore = (roomId: string): IPowerLevels => {
  const core = useCore();
  const store = useMemo(() => core.rooms.powerLevels(roomId), [core, roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export function usePowerLevels(room: Room): IPowerLevels {
  return useCorePowerLevelsStore(room.roomId);
}

export const PowerLevelsContext = createContext<IPowerLevels | null>(null);

export const PowerLevelsContextProvider = PowerLevelsContext.Provider;

export const usePowerLevelsContext = (): IPowerLevels => {
  const pl = useContext(PowerLevelsContext);
  if (!pl) throw new Error('PowerLevelContext is not initialized!');
  return pl;
};

export const useRoomsPowerLevels = (rooms: Room[]): Map<string, IPowerLevels> => {
  const core = useCore();
  const stores = useMemo(
    () => rooms.map((room) => [room.roomId, core.rooms.powerLevels(room.roomId)] as const),
    [core, rooms]
  );

  const [roomToPowerLevels, setRoomToPowerLevels] = useState<Map<string, IPowerLevels>>(
    () => new Map(stores.map(([roomId, store]) => [roomId, store.getSnapshot().value]))
  );

  useEffect(() => {
    setRoomToPowerLevels(
      new Map(stores.map(([roomId, store]) => [roomId, store.getSnapshot().value]))
    );
    const unsubscribes = stores.map(([roomId, store]) =>
      store.subscribe(() => {
        setRoomToPowerLevels((previous) => {
          if (previous.get(roomId) === store.getSnapshot().value) return previous;
          const next = new Map(previous);
          next.set(roomId, store.getSnapshot().value);
          return next;
        });
      })
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [stores]);

  return roomToPowerLevels;
};

export const useGetMemberPowerLevel = (powerLevels: IPowerLevels) => {
  const callback = useCallback(
    (userId?: string): number => readPowerLevel.user(powerLevels, userId),
    [powerLevels]
  );

  return callback;
};
