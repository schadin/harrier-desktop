import { describe, expect, it } from 'vitest';
import {
  byOrderKey,
  byTsOldToNew,
  compareRoomIdsEqual,
  compareRoomNameAtoZ,
  deleteUnreadInfo,
  factoryRoomIdByActivity,
  factoryRoomIdByUnreadCount,
  factoryRoomIdSort,
  putUnreadInfo,
  unreadEqual,
  unreadInfoToUnread,
  type AggregatedUnread,
  type RoomSortMeta,
} from './roomList';

describe('compareRoomNameAtoZ', () => {
  it('compares case-insensitively', () => {
    expect(compareRoomNameAtoZ('Alpha', 'beta')).toBe(-1);
    expect(compareRoomNameAtoZ('Beta', 'alpha')).toBe(1);
    expect(compareRoomNameAtoZ('Same', 'same')).toBe(0);
  });

  it('ignores # prefixes', () => {
    expect(compareRoomNameAtoZ('#Room', 'Room')).toBe(0);
    expect(compareRoomNameAtoZ('#Alpha', 'Beta')).toBe(-1);
  });
});

describe('factoryRoomIdSort', () => {
  const meta = new Map<string, RoomSortMeta>([
    ['!a:example.org', { name: 'Alpha', lastActiveTimestamp: 100 }],
    ['!b:example.org', { name: '#Beta', lastActiveTimestamp: 200 }],
    ['!missing:example.org', { name: '', lastActiveTimestamp: 0 }],
  ]);
  const getMeta = (roomId: string): RoomSortMeta | undefined => meta.get(roomId);

  it('sorts A to Z and Z to A by name', () => {
    const atoz = factoryRoomIdSort(getMeta, 'atoz');
    expect(atoz?.('!b:example.org', '!a:example.org')).toBe(1);
    const ztoa = factoryRoomIdSort(getMeta, 'ztoa');
    expect(ztoa?.('!b:example.org', '!a:example.org')).toBe(-1);
  });

  it('sorts by activity newest and oldest first', () => {
    const desc = factoryRoomIdSort(getMeta, 'activity_desc');
    expect(desc?.('!a:example.org', '!b:example.org')).toBe(100);
    const asc = factoryRoomIdSort(getMeta, 'activity_asc');
    expect(asc?.('!a:example.org', '!b:example.org')).toBe(-100);
  });

  it('returns undefined for manual and unknown sort types', () => {
    expect(factoryRoomIdSort(getMeta, 'manual')).toBeUndefined();
    expect(factoryRoomIdSort(getMeta, 'unknown' as never)).toBeUndefined();
  });

  it('treats missing rooms as lowest activity', () => {
    const byActivity = factoryRoomIdByActivity(() => undefined);
    expect(byActivity('!a:example.org', '!b:example.org')).toBe(0);
  });
});

describe('factoryRoomIdByUnreadCount', () => {
  it('sorts by unread count descending', () => {
    const counts = new Map([
      ['!a:example.org', 1],
      ['!b:example.org', 5],
    ]);
    const byUnread = factoryRoomIdByUnreadCount((roomId) => counts.get(roomId) ?? 0);
    expect(byUnread('!a:example.org', '!b:example.org')).toBe(4);
  });
});

describe('byTsOldToNew and byOrderKey', () => {
  it('sorts timestamps ascending', () => {
    expect(byTsOldToNew(1, 2)).toBe(-1);
    expect(byTsOldToNew(2, 1)).toBe(1);
  });

  it('sorts order keys with undefined last', () => {
    expect(byOrderKey('a', 'b')).toBe(-1);
    expect(byOrderKey('a', undefined)).toBe(-1);
    expect(byOrderKey(undefined, 'b')).toBe(1);
    expect(byOrderKey(undefined, undefined)).toBe(0);
  });
});

describe('compareRoomIdsEqual', () => {
  it('compares room id arrays by order and length', () => {
    expect(compareRoomIdsEqual(['!a', '!b'], ['!a', '!b'])).toBe(true);
    expect(compareRoomIdsEqual(['!a', '!b'], ['!b', '!a'])).toBe(false);
    expect(compareRoomIdsEqual(['!a'], ['!a', '!b'])).toBe(false);
  });
});

describe('unread aggregation', () => {
  it('maps unread info to unread without sources', () => {
    expect(unreadInfoToUnread({ total: 3, highlight: 1 })).toEqual({
      total: 3,
      highlight: 1,
      from: null,
    });
  });

  it('compares unreads including source sets', () => {
    const base: AggregatedUnread = { total: 1, highlight: 0, from: null };
    expect(unreadEqual(base, { total: 1, highlight: 0, from: null })).toBe(true);
    expect(unreadEqual(base, { total: 2, highlight: 0, from: null })).toBe(false);
    expect(unreadEqual(base, { total: 1, highlight: 0, from: new Set(['!a']) })).toBe(false);
    expect(
      unreadEqual(
        { total: 1, highlight: 0, from: new Set(['!a', '!b']) },
        { total: 1, highlight: 0, from: new Set(['!b', '!a']) }
      )
    ).toBe(true);
  });

  it('puts unread info and aggregates into parents', () => {
    const empty = new Map<string, AggregatedUnread>();
    const parents = new Set(['!space:example.org']);
    const first = putUnreadInfo(empty, parents, {
      roomId: '!a:example.org',
      total: 2,
      highlight: 1,
    });

    expect(first.get('!a:example.org')).toEqual({ total: 2, highlight: 1, from: null });
    expect(first.get('!space:example.org')).toEqual({
      total: 2,
      highlight: 1,
      from: new Set(['!a:example.org']),
    });
    // input map is not mutated
    expect(empty.size).toBe(0);

    const second = putUnreadInfo(first, parents, {
      roomId: '!a:example.org',
      total: 5,
      highlight: 2,
    });
    expect(second.get('!a:example.org')).toEqual({ total: 5, highlight: 2, from: null });
    expect(second.get('!space:example.org')).toEqual({
      total: 5,
      highlight: 2,
      from: new Set(['!a:example.org']),
    });
  });

  it('deletes unread info and decrements parents', () => {
    const parents = new Set(['!space:example.org']);
    const withUnread = putUnreadInfo(new Map(), parents, {
      roomId: '!a:example.org',
      total: 2,
      highlight: 1,
    });

    const afterDelete = deleteUnreadInfo(withUnread, parents, '!a:example.org');
    expect(afterDelete.has('!a:example.org')).toBe(false);
    expect(afterDelete.has('!space:example.org')).toBe(false);

    // deleting unknown room returns the same map reference
    expect(deleteUnreadInfo(afterDelete, parents, '!unknown:example.org')).toBe(afterDelete);
  });

  it('keeps parent while other sources remain', () => {
    const parents = new Set(['!space:example.org']);
    let roomToUnread = putUnreadInfo(new Map(), parents, {
      roomId: '!a:example.org',
      total: 1,
      highlight: 0,
    });
    roomToUnread = putUnreadInfo(roomToUnread, parents, {
      roomId: '!b:example.org',
      total: 3,
      highlight: 1,
    });

    const afterDelete = deleteUnreadInfo(roomToUnread, parents, '!a:example.org');
    expect(afterDelete.get('!space:example.org')).toEqual({
      total: 3,
      highlight: 1,
      from: new Set(['!b:example.org']),
    });
  });
});
