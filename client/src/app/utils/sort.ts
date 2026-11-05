import { MatrixClient } from 'matrix-js-sdk';
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

const factoryGetMeta =
  (mx: MatrixClient) =>
  (roomId: string): RoomSortMeta | undefined => {
    const room = mx.getRoom(roomId);
    if (!room) return undefined;
    return { name: room.name, lastActiveTimestamp: room.getLastActiveTimestamp() };
  };

export const factoryRoomIdByActivity = (mx: MatrixClient): SortFunc<string> =>
  coreFactoryRoomIdByActivity(factoryGetMeta(mx));

export const factoryRoomIdByAtoZ = (mx: MatrixClient): SortFunc<string> =>
  coreFactoryRoomIdByAtoZ(factoryGetMeta(mx));

export const factoryRoomIdByZtoA = (mx: MatrixClient): SortFunc<string> =>
  coreFactoryRoomIdByZtoA(factoryGetMeta(mx));

export const factoryRoomIdByActivityAsc = (mx: MatrixClient): SortFunc<string> =>
  coreFactoryRoomIdByActivityAsc(factoryGetMeta(mx));

export const factoryRoomIdSort = (
  mx: MatrixClient,
  sortType: RoomSortType
): SortFunc<string> | undefined => coreFactoryRoomIdSort(factoryGetMeta(mx), sortType);

export const factoryRoomIdByUnreadCount = coreFactoryRoomIdByUnreadCount;

export const byTsOldToNew: SortFunc<number> = coreByTsOldToNew;

export const byOrderKey: SortFunc<string | undefined> = coreByOrderKey;
