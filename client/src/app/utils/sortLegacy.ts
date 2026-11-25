import type { SortFunc } from '@harrier/core';
import type { RoomSortType } from '../../types/matrix/accountData';
import {
  factoryRoomIdByActivity as coreFactoryRoomIdByActivity,
  factoryRoomIdByActivityAsc as coreFactoryRoomIdByActivityAsc,
  factoryRoomIdByAtoZ as coreFactoryRoomIdByAtoZ,
  factoryRoomIdByZtoA as coreFactoryRoomIdByZtoA,
  factoryRoomIdSort as coreFactoryRoomIdSort,
  type RoomSortSource,
} from './sort';

type LegacyRoomSortMeta = {
  name: string;
  getLastActiveTimestamp(): number;
};

export type LegacyRoomSortSource = {
  getRoom(roomId: string): LegacyRoomSortMeta | null;
};

const toCoreSource = (source: LegacyRoomSortSource): RoomSortSource => ({
  getRoom: (roomId) => {
    const room = source.getRoom(roomId);
    if (!room) return null;
    return { name: room.name, lastActiveTimestamp: room.getLastActiveTimestamp() };
  },
});

export const factoryRoomIdByActivity = (source: LegacyRoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByActivity(toCoreSource(source));

export const factoryRoomIdByAtoZ = (source: LegacyRoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByAtoZ(toCoreSource(source));

export const factoryRoomIdByZtoA = (source: LegacyRoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByZtoA(toCoreSource(source));

export const factoryRoomIdByActivityAsc = (source: LegacyRoomSortSource): SortFunc<string> =>
  coreFactoryRoomIdByActivityAsc(toCoreSource(source));

export const factoryRoomIdSort = (
  source: LegacyRoomSortSource,
  sortType: RoomSortType
): SortFunc<string> | undefined => coreFactoryRoomIdSort(toCoreSource(source), sortType);
