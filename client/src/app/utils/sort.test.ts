import type { RoomSortMeta } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import {
  factoryRoomIdByActivity,
  factoryRoomIdByActivityAsc,
  factoryRoomIdByAtoZ,
  factoryRoomIdSort,
  factoryRoomIdByZtoA,
} from './sort';

const meta = new Map<string, RoomSortMeta>([
  ['!a:example.org', { name: '#Alpha', lastActiveTimestamp: 100 }],
  ['!b:example.org', { name: 'Beta', lastActiveTimestamp: 200 }],
  ['!empty:example.org', { name: 'Empty', lastActiveTimestamp: Number.MIN_SAFE_INTEGER }],
]);

const source = {
  getRoom: (roomId: string) => meta.get(roomId) ?? null,
};

describe('room sort adapters with plain core summaries', () => {
  it('sorts activity without an SDK timestamp method', () => {
    expect(factoryRoomIdByActivity(source)('!a:example.org', '!b:example.org')).toBe(100);
    expect(factoryRoomIdByActivityAsc(source)('!a:example.org', '!b:example.org')).toBe(-100);
  });

  it('sorts names in both directions', () => {
    expect(factoryRoomIdByAtoZ(source)('!b:example.org', '!a:example.org')).toBe(1);
    expect(factoryRoomIdByZtoA(source)('!b:example.org', '!a:example.org')).toBe(-1);
  });

  it('uses the existing sentinel for unknown rooms', () => {
    expect(factoryRoomIdByActivity(source)('!missing:example.org', '!empty:example.org')).toBe(0);
    expect(
      factoryRoomIdByActivity(source)('!missing:example.org', '!b:example.org')
    ).toBeGreaterThan(0);
    expect(
      factoryRoomIdByActivityAsc(source)('!missing:example.org', '!b:example.org')
    ).toBeLessThan(0);
  });

  it('delegates combined sorting and preserves manual order', () => {
    expect(factoryRoomIdSort(source, 'activity_desc')?.('!a:example.org', '!b:example.org')).toBe(
      100
    );
    expect(factoryRoomIdSort(source, 'manual')).toBeUndefined();
  });
});
