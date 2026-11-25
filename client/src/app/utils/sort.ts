import {
  byOrderKey as coreByOrderKey,
  byTsOldToNew as coreByTsOldToNew,
  factoryRoomIdByActivity as coreFactoryRoomIdByActivity,
  factoryRoomIdByActivityAsc as coreFactoryRoomIdByActivityAsc,
  factoryRoomIdByAtoZ as coreFactoryRoomIdByAtoZ,
  factoryRoomIdByUnreadCount as coreFactoryRoomIdByUnreadCount,
  factoryRoomIdByZtoA as coreFactoryRoomIdByZtoA,
  factoryRoomIdSort as coreFactoryRoomIdSort,
  type RoomSortMeta,
  type SortFunc,
} from '@harrier/core';
import { RoomSortType } from '../../types/matrix/accountData';

export type { SortFunc } from '@harrier/core';

type LegacyRoomSortMeta = {
  name: string;
  getLastActiveTimestamp(): number;
};

export type RoomSortSource = {
  getRoom(roomId: string): RoomSortMeta | LegacyRoomSortMeta | null;
};

const isPlainRoomSortMeta = (room: RoomSortMeta | LegacyRoomSortMeta): room is RoomSortMeta =>
  'lastActiveTimestamp' in room;

const factoryGetMeta =
  (source: RoomSortSource) =>
  (roomId: string): RoomSortMeta | undefined => {
    const room = source.getRoom(roomId);
    if (!room) return undefined;
    if (isPlainRoomSortMeta(room)) return room;
    return { name: room.name, lastActiveTimestamp: room.getLastActiveTimestamp() };
  };

export const factoryRoomIdByActivity = (source: RoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByActivity(factoryGetMeta(source));

export const factoryRoomIdByAtoZ = (source: RoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByAtoZ(factoryGetMeta(source));

export const factoryRoomIdByZtoA = (source: RoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByZtoA(factoryGetMeta(source));

export const factoryRoomIdByActivityAsc = (source: RoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByActivityAsc(factoryGetMeta(source));

export const factoryRoomIdSort = (
  source: RoomSortSource,
  sortType: RoomSortType
): SortFunc<string> | undefined => coreFactoryRoomIdSort(factoryGetMeta(source), sortType);

export const factoryRoomIdByUnreadCount = coreFactoryRoomIdByUnreadCount;

export const byTsOldToNew: SortFunc<number> = coreByTsOldToNew;

export const byOrderKey: SortFunc<string | undefined> = coreByOrderKey;
