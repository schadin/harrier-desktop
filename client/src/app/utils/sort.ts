import { MatrixClient } from 'matrix-js-sdk';
import { RoomSortType } from '../../types/matrix/accountData';

export type SortFunc<T> = (a: T, b: T) => number;

export const factoryRoomIdByActivity =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) => {
    const room1 = mx.getRoom(a);
    const room2 = mx.getRoom(b);

    return (
      (room2?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER) -
      (room1?.getLastActiveTimestamp() ?? Number.MIN_SAFE_INTEGER)
    );
  };

export const factoryRoomIdByAtoZ =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) => {
    let aName = mx.getRoom(a)?.name ?? '';
    let bName = mx.getRoom(b)?.name ?? '';

    // remove "#" from the room name
    // To ignore it in sorting
    aName = aName.replace(/#/g, '');
    bName = bName.replace(/#/g, '');

    if (aName.toLowerCase() < bName.toLowerCase()) {
      return -1;
    }
    if (aName.toLowerCase() > bName.toLowerCase()) {
      return 1;
    }
    return 0;
  };

export const factoryRoomIdByZtoA =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) =>
    factoryRoomIdByAtoZ(mx)(b, a);

export const factoryRoomIdByActivityAsc =
  (mx: MatrixClient): SortFunc<string> =>
  (a, b) =>
    factoryRoomIdByActivity(mx)(b, a);

export const factoryRoomIdSort = (
  mx: MatrixClient,
  sortType: RoomSortType
): SortFunc<string> | undefined => {
  switch (sortType) {
    case 'atoz':
      return factoryRoomIdByAtoZ(mx);
    case 'ztoa':
      return factoryRoomIdByZtoA(mx);
    case 'activity_desc':
      return factoryRoomIdByActivity(mx);
    case 'activity_asc':
      return factoryRoomIdByActivityAsc(mx);
    case 'manual':
    default:
      return undefined;
  }
};

export const factoryRoomIdByUnreadCount =
  (getUnreadCount: (roomId: string) => number): SortFunc<string> =>
  (a, b) => {
    const aT = getUnreadCount(a) ?? 0;
    const bT = getUnreadCount(b) ?? 0;
    return bT - aT;
  };

export const byTsOldToNew: SortFunc<number> = (a, b) => a - b;

export const byOrderKey: SortFunc<string | undefined> = (a, b) => {
  if (!a && !b) {
    return 0;
  }

  if (!b) return -1;
  if (!a) return 1;

  if (a < b) {
    return -1;
  }
  return 1;
};
