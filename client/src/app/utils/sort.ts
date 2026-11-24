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

// RoomView does not expose the live timeline timestamp yet. Keep this bridge
// structural so activity sorting stays identical to the SDK implementation.
type RoomSortSource = {
  getRoom(roomId: string): {
    name: string;
    getLastActiveTimestamp(): number;
  } | null;
};

const factoryGetMeta =
  (source: RoomSortSource) =>
  (roomId: string): RoomSortMeta | undefined => {
    const room = source.getRoom(roomId);
    if (!room) return undefined;
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
