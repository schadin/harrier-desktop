import type { MemberView } from './views';

export type MemberSortFn = (a: MemberView, b: MemberView) => number;

export const MemberSort = {
  Ascending: (a: MemberView, b: MemberView): number =>
    a.displayName.toLowerCase() < b.displayName.toLowerCase() ? -1 : 1,
  Descending: (a: MemberView, b: MemberView): number =>
    a.displayName.toLowerCase() > b.displayName.toLowerCase() ? -1 : 1,
  NewestFirst: (a: MemberView, b: MemberView): number => (b.joinedAt ?? 0) - (a.joinedAt ?? 0),
  Oldest: (a: MemberView, b: MemberView): number => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
};

export const sortMembersByPower = (
  a: MemberView,
  b: MemberView,
  creators: Set<string> | readonly string[],
  getPowerLevel: (userId: string) => number
): number => {
  const aCreator = creators instanceof Set ? creators.has(a.userId) : creators.includes(a.userId);
  const bCreator = creators instanceof Set ? creators.has(b.userId) : creators.includes(b.userId);
  if (aCreator && bCreator) return 0;
  if (aCreator) return -1;
  if (bCreator) return 1;
  return getPowerLevel(b.userId) - getPowerLevel(a.userId);
};

export type MembershipFilterFn = (member: MemberView) => boolean;

export const MembershipFilter = {
  filterJoined: (member: MemberView): boolean => member.membership === 'join',
  filterInvited: (member: MemberView): boolean => member.membership === 'invite',
  filterLeaved: (member: MemberView): boolean =>
    member.membership === 'leave' && member.leftBySelf === true,
  filterKicked: (member: MemberView): boolean =>
    member.membership === 'leave' && member.leftBySelf === false,
  filterBanned: (member: MemberView): boolean => member.membership === 'ban',
};

export const getMemberSearchStr = (
  member: MemberView,
  query: string,
  mxIdToName: (mxId: string) => string
): string[] => [
  member.rawDisplayName === undefined || member.rawDisplayName === member.userId
    ? mxIdToName(member.userId)
    : member.rawDisplayName,
  query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId),
];
