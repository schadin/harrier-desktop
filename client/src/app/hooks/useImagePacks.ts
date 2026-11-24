import { useMemo } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import {
  getGlobalImagePacks,
  getUserImagePack,
  ImagePack,
  ImageUsage,
  makeImagePacksFromState,
  EmoteRoomsContent,
} from '../plugins/custom-emoji';
import { useAccountData } from './useAccountData';
import { useCore } from './useCore';
import { useCoreRoomStateList, useCoreRoomsStateList } from './useCoreRoomState';
import { PackAddress } from '../plugins/custom-emoji/PackAddress';
import { PackContent } from '../plugins/custom-emoji/types';

type ImagePackRoom = { roomId: string };

export const useUserImagePack = (): ImagePack | undefined => {
  const core = useCore();
  const content = useAccountData(AccountDataEvent.PoniesUserEmotes);

  return useMemo(() => getUserImagePack(core, content), [core, content]);
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const core = useCore();
  const content = useAccountData(
    AccountDataEvent.PoniesEmoteRooms
  ) as unknown as EmoteRoomsContent | null;
  const roomIds = useMemo(() => {
    const rooms = content?.rooms;
    return rooms && typeof rooms === 'object' && !Array.isArray(rooms) ? Object.keys(rooms) : [];
  }, [content]);
  const rooms = useMemo(() => roomIds.map((roomId) => ({ roomId })), [roomIds]);
  const stateByRoom = useCoreRoomsStateList(rooms, StateEvent.PoniesRoomEmotes);

  return useMemo(
    () => getGlobalImagePacks(core, content, stateByRoom),
    [core, content, stateByRoom]
  );
};

export const useRoomImagePack = (room: ImagePackRoom, stateKey: string): ImagePack | undefined => {
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

export const useRoomImagePacks = (room: ImagePackRoom): ImagePack[] => {
  const entries = useCoreRoomStateList(room, StateEvent.PoniesRoomEmotes);
  return useMemo(() => makeImagePacksFromState(room.roomId, entries), [room.roomId, entries]);
};

export const useRoomsImagePacks = (rooms: readonly ImagePackRoom[]): ImagePack[] => {
  const stateByRoom = useCoreRoomsStateList(rooms, StateEvent.PoniesRoomEmotes);
  return useMemo(
    () =>
      rooms.flatMap((room) =>
        makeImagePacksFromState(room.roomId, stateByRoom.get(room.roomId) ?? [])
      ),
    [rooms, stateByRoom]
  );
};

export const useRelevantImagePacks = (
  usage: ImageUsage,
  rooms: readonly ImagePackRoom[]
): ImagePack[] => {
  const userPack = useUserImagePack();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  return useMemo(() => {
    const packs = userPack ? [userPack] : [];
    const globalPackIds = new Set(globalPacks.map((pack) => pack.id));

    const relPacks = packs.concat(
      globalPacks,
      roomsPacks.filter((pack) => !globalPackIds.has(pack.id))
    );

    return relPacks.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, globalPacks, roomsPacks, usage]);
};
