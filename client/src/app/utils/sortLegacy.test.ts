import { describe, expect, it } from 'vitest';
import {
  factoryRoomIdByActivity,
  factoryRoomIdByActivityAsc,
  factoryRoomIdByAtoZ,
  factoryRoomIdSort,
  factoryRoomIdByZtoA,
} from './sortLegacy';

const rooms = new Map([
  ['!a:example.org', { name: 'Alpha', getLastActiveTimestamp: () => 100 }],
  ['!b:example.org', { name: 'Beta', getLastActiveTimestamp: () => 200 }],
]);

const source = {
  getRoom: (roomId: string) => rooms.get(roomId) ?? null,
};

describe('legacy room sort compatibility', () => {
  it('keeps existing raw room consumers sorting by activity and name', () => {
    expect(factoryRoomIdByActivity(source)('!a:example.org', '!b:example.org')).toBe(100);
    expect(factoryRoomIdByActivityAsc(source)('!a:example.org', '!b:example.org')).toBe(-100);
    expect(factoryRoomIdByAtoZ(source)('!b:example.org', '!a:example.org')).toBe(1);
    expect(factoryRoomIdByZtoA(source)('!b:example.org', '!a:example.org')).toBe(-1);
    expect(factoryRoomIdSort(source, 'activity_desc')?.('!a:example.org', '!b:example.org')).toBe(
      100
    );
  });

  it('keeps the existing unknown-room sentinel', () => {
    expect(
      factoryRoomIdByActivity(source)('!missing:example.org', '!b:example.org')
    ).toBeGreaterThan(0);
  });
});
