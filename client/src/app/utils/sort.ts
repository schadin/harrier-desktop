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

export type RoomSortSource = {
  getRoom(roomId: string): RoomSortMeta | null;
};

const factoryGetMeta =
  (source: RoomSortSource) =>
  (roomId: string): RoomSortMeta | undefined =>
    source.getRoom(roomId) ?? undefined;

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
