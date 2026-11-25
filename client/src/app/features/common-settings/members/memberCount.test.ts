import type { MemberView } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { getLoadedJoinedMemberCount } from './memberCount';

const member = (userId: string, membership: MemberView['membership']): MemberView => ({
  userId,
  displayName: userId,
  membership,
  powerLevel: 0,
});

describe('getLoadedJoinedMemberCount', () => {
  it('counts only joined members in a mixed membership snapshot', () => {
    const members = [
      member('@joined-1:example.org', 'join'),
      member('@invited:example.org', 'invite'),
      member('@joined-2:example.org', 'join'),
      member('@left:example.org', 'leave'),
      member('@banned:example.org', 'ban'),
      member('@knocking:example.org', 'knock'),
    ];

    expect(getLoadedJoinedMemberCount(members)).toBe(2);
  });

  it('returns zero for an empty snapshot', () => {
    expect(getLoadedJoinedMemberCount([])).toBe(0);
  });
});
