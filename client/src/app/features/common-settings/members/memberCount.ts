import type { MemberView } from '@harrier/core';

export const getLoadedJoinedMemberCount = (members: readonly MemberView[]): number =>
  members.reduce((count, member) => count + (member.membership === 'join' ? 1 : 0), 0);
