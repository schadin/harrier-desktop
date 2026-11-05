import type { UnreadCountView } from './views';

export type SortFunc<T> = (a: T, b: T) => number;

export type RoomSortType = 'manual' | 'atoz' | 'ztoa' | 'activity_desc' | 'activity_asc';

export type RoomSortMeta = {
  readonly name: string;
  readonly lastActiveTimestamp: number;
};

export type AggregatedUnread = UnreadCountView & {
  readonly from: ReadonlySet<string> | null;
};

export type UnreadInfo = UnreadCountView & {
  readonly roomId: string;
};

export const compareRoomIdsEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((roomId, index) => roomId === b[index]);
};

export const compareRoomNameAtoZ = (aName: string, bName: string): number => {
  // remove "#" from the room name
  // To ignore it in sorting
  const a = aName.replace(/#/g, '').toLowerCase();
  const b = bName.replace(/#/g, '').toLowerCase();

  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

export const factoryRoomIdByAtoZ =
  (getMeta: (roomId: string) => RoomSortMeta | undefined): SortFunc<string> =>
  (a, b) =>
    compareRoomNameAtoZ(getMeta(a)?.name ?? '', getMeta(b)?.name ?? '');

export const factoryRoomIdByZtoA =
  (getMeta: (roomId: string) => RoomSortMeta | undefined): SortFunc<string> =>
  (a, b) =>
    factoryRoomIdByAtoZ(getMeta)(b, a);

export const factoryRoomIdByActivity =
  (getMeta: (roomId: string) => RoomSortMeta | undefined): SortFunc<string> =>
  (a, b) =>
    (getMeta(b)?.lastActiveTimestamp ?? Number.MIN_SAFE_INTEGER) -
    (getMeta(a)?.lastActiveTimestamp ?? Number.MIN_SAFE_INTEGER);

export const factoryRoomIdByActivityAsc =
  (getMeta: (roomId: string) => RoomSortMeta | undefined): SortFunc<string> =>
  (a, b) =>
    factoryRoomIdByActivity(getMeta)(b, a);

export const factoryRoomIdSort = (
  getMeta: (roomId: string) => RoomSortMeta | undefined,
  sortType: RoomSortType
): SortFunc<string> | undefined => {
  switch (sortType) {
    case 'atoz':
      return factoryRoomIdByAtoZ(getMeta);
    case 'ztoa':
      return factoryRoomIdByZtoA(getMeta);
    case 'activity_desc':
      return factoryRoomIdByActivity(getMeta);
    case 'activity_asc':
      return factoryRoomIdByActivityAsc(getMeta);
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

export const unreadInfoToUnread = (unreadInfo: UnreadCountView): AggregatedUnread => ({
  highlight: unreadInfo.highlight,
  total: unreadInfo.total,
  from: null,
});

export const unreadEqual = (u1: AggregatedUnread, u2: AggregatedUnread): boolean => {
  const countEqual = u1.highlight === u2.highlight && u1.total === u2.total;

  if (!countEqual) return false;

  const f1 = u1.from;
  const f2 = u2.from;
  if (f1 === null && f2 === null) return true;
  if (f1 === null || f2 === null) return false;

  if (f1.size !== f2.size) return false;

  let fromEqual = true;
  f1.forEach((item) => {
    if (!f2.has(item)) {
      fromEqual = false;
    }
  });

  return fromEqual;
};

export const putUnreadInfo = (
  roomToUnread: ReadonlyMap<string, AggregatedUnread>,
  allParents: ReadonlySet<string>,
  unreadInfo: UnreadInfo
): Map<string, AggregatedUnread> => {
  const next = new Map(roomToUnread);
  const oldUnread = next.get(unreadInfo.roomId) ?? { highlight: 0, total: 0, from: null };
  next.set(unreadInfo.roomId, unreadInfoToUnread(unreadInfo));

  const newH = unreadInfo.highlight - oldUnread.highlight;
  const newT = unreadInfo.total - oldUnread.total;

  allParents.forEach((parentId) => {
    const oldParentUnread = next.get(parentId) ?? { highlight: 0, total: 0, from: null };
    next.set(parentId, {
      highlight: oldParentUnread.highlight + newH,
      total: oldParentUnread.total + newT,
      from: new Set([...(oldParentUnread.from ?? []), unreadInfo.roomId]),
    });
  });

  return next;
};

export const deleteUnreadInfo = (
  roomToUnread: ReadonlyMap<string, AggregatedUnread>,
  allParents: ReadonlySet<string>,
  roomId: string
): ReadonlyMap<string, AggregatedUnread> => {
  const oldUnread = roomToUnread.get(roomId);
  if (!oldUnread) return roomToUnread;

  const next = new Map(roomToUnread);
  next.delete(roomId);

  allParents.forEach((parentId) => {
    const oldParentUnread = next.get(parentId);
    if (!oldParentUnread) return;
    const newFrom = new Set(oldParentUnread.from ?? []);
    newFrom.delete(roomId);
    if (newFrom.size === 0) {
      next.delete(parentId);
      return;
    }
    next.set(parentId, {
      highlight: oldParentUnread.highlight - oldUnread.highlight,
      total: oldParentUnread.total - oldUnread.total,
      from: newFrom,
    });
  });

  return next;
};
