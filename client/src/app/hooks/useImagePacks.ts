import { Room } from 'matrix-js-sdk';
import { useCallback, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import {
  getGlobalImagePacks,
  getUserImagePack,
  ImagePack,
  ImageUsage,
  makeImagePacksFromState,
} from '../plugins/custom-emoji';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useStateEventCallback } from './useStateEventCallback';
import { useCoreRoomStateList, useCoreRoomsStateList } from './useCoreRoomState';
import { PackAddress } from '../plugins/custom-emoji/PackAddress';
import { PackContent } from '../plugins/custom-emoji/types';

export const useUserImagePack = (): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [userPack, setUserPack] = useState(() => getUserImagePack(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesUserEmotes) {
          setUserPack(getUserImagePack(mx));
        }
      },
      [mx]
    )
  );

  return userPack;
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const [globalPacks, setGlobalPacks] = useState(() => getGlobalImagePacks(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesEmoteRooms) {
          setGlobalPacks(getGlobalImagePacks(mx));
        }
      },
      [mx]
    )
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const eventType = mEvent.getType();
        const roomId = mEvent.getRoomId();
        const stateKey = mEvent.getStateKey();
        if (eventType === StateEvent.PoniesRoomEmotes && roomId && typeof stateKey === 'string') {
          const global = !!globalPacks.find(
            (pack) =>
              pack.address && pack.address.roomId === roomId && pack.address.stateKey === stateKey
          );
          if (global) {
            setGlobalPacks(getGlobalImagePacks(mx));
          }
        }
      },
      [mx, globalPacks]
    )
  );

  return globalPacks;
};

export const useRoomImagePack = (room: Room, stateKey: string): ImagePack | undefined => {
  const entries = useCoreRoomStateList(room, StateEvent.PoniesRoomEmotes);
  return useMemo(() => {
    const entry = entries.find((item) => item.stateKey === stateKey);
    if (!entry) return undefined;
    return new ImagePack(
      entry.eventId ?? `${room.roomId}|${stateKey}`,
      entry.content as PackContent,
      new PackAddress(room.roomId, stateKey)
    );
  }, [entries, room.roomId, stateKey]);
};

export const useRoomImagePacks = (room: Room): ImagePack[] => {
  const entries = useCoreRoomStateList(room, StateEvent.PoniesRoomEmotes);
  return useMemo(() => makeImagePacksFromState(room.roomId, entries), [room.roomId, entries]);
};

export const useRoomsImagePacks = (rooms: Room[]) => {
  const stateByRoom = useCoreRoomsStateList(rooms, StateEvent.PoniesRoomEmotes);
  return useMemo(
    () =>
      rooms.flatMap((room) =>
        makeImagePacksFromState(room.roomId, stateByRoom.get(room.roomId) ?? [])
      ),
    [rooms, stateByRoom]
  );
};

export const useRelevantImagePacks = (usage: ImageUsage, rooms: Room[]): ImagePack[] => {
  const userPack = useUserImagePack();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const packs = userPack ? [userPack] : [];
    const globalPackIds = new Set(globalPacks.map((pack) => pack.id));

    const relPacks = packs.concat(
      globalPacks,
      roomsPacks.filter((pack) => !globalPackIds.has(pack.id))
    );

    return relPacks.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, globalPacks, roomsPacks, usage]);

  return relevantPacks;
};
