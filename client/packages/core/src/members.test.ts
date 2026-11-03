import { describe, expect, it } from 'vitest';
import { MemberSort, MembershipFilter, getMemberSearchStr, sortMembersByPower } from './members';
import type { MemberView } from './views';

const member = (overrides: Partial<MemberView>): MemberView => ({
  userId: '@user:example.org',
  displayName: 'User',
  membership: 'join',
  powerLevel: 0,
  ...overrides,
});

describe('MemberSort', () => {
  const alice = member({ userId: '@alice:example.org', displayName: 'Alice', joinedAt: 100 });
  const bob = member({ userId: '@bob:example.org', displayName: 'bob', joinedAt: 200 });

  it('sorts ascending and descending by display name case-insensitively', () => {
    expect(MemberSort.Ascending(alice, bob)).toBe(-1);
    expect(MemberSort.Descending(alice, bob)).toBe(1);
  });

  it('sorts by join timestamp newest and oldest', () => {
    expect(MemberSort.NewestFirst(alice, bob)).toBe(100);
    expect(MemberSort.Oldest(alice, bob)).toBe(-100);
  });

  it('treats missing join timestamps as zero', () => {
    const unknown = member({ userId: '@u:example.org', displayName: 'U' });
    expect(MemberSort.Oldest(unknown, alice)).toBeLessThan(0);
  });
});

describe('sortMembersByPower', () => {
  it('ranks creators first regardless of power level', () => {
    const creator = member({ userId: '@creator:example.org', powerLevel: 0 });
    const admin = member({ userId: '@admin:example.org', powerLevel: 100 });
    expect(sortMembersByPower(creator, admin, ['@creator:example.org'], () => 0)).toBe(-1);
    expect(sortMembersByPower(admin, creator, ['@creator:example.org'], () => 0)).toBe(1);
  });

  it('falls back to resolved power levels', () => {
    const low = member({ userId: '@low:example.org' });
    const high = member({ userId: '@high:example.org' });
    const getPowerLevel = (userId: string) => (userId === '@high:example.org' ? 50 : 0);
    expect(sortMembersByPower(low, high, [], getPowerLevel)).toBeGreaterThan(0);
  });
});

describe('MembershipFilter', () => {
  it('distinguishes leaved from kicked by leftBySelf', () => {
    const leaved = member({ membership: 'leave', leftBySelf: true });
    const kicked = member({ membership: 'leave', leftBySelf: false });
    expect(MembershipFilter.filterLeaved(leaved)).toBe(true);
    expect(MembershipFilter.filterLeaved(kicked)).toBe(false);
    expect(MembershipFilter.filterKicked(kicked)).toBe(true);
    expect(MembershipFilter.filterKicked(leaved)).toBe(false);
  });

  it('filters joined, invited and banned', () => {
    expect(MembershipFilter.filterJoined(member({ membership: 'join' }))).toBe(true);
    expect(MembershipFilter.filterInvited(member({ membership: 'invite' }))).toBe(true);
    expect(MembershipFilter.filterBanned(member({ membership: 'ban' }))).toBe(true);
  });
});

describe('getMemberSearchStr', () => {
  const mxIdToName = (mxId: string) => mxId.slice(1).split(':')[0] ?? mxId;

  it('prefers raw display name over mxid local part', () => {
    const alice = member({ userId: '@alice:example.org', rawDisplayName: 'Alice A' });
    expect(getMemberSearchStr(alice, 'ali', mxIdToName)).toEqual(['Alice A', 'alice']);
  });

  it('falls back to mxid local part when raw display name equals user id', () => {
    const noName = member({ userId: '@alice:example.org', rawDisplayName: '@alice:example.org' });
    expect(getMemberSearchStr(noName, 'ali', mxIdToName)).toEqual(['alice', 'alice']);
  });

  it('searches by full user id for mxid-like queries', () => {
    const alice = member({ userId: '@alice:example.org', rawDisplayName: 'Alice' });
    expect(getMemberSearchStr(alice, '@alice:exa', mxIdToName)).toEqual([
      'Alice',
      '@alice:example.org',
    ]);
  });
});
