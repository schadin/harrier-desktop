import { useMemo } from 'react';
import { MembershipFilter } from '@harrier/core';
import type { MembershipFilterFn } from '@harrier/core';

export { MembershipFilter };
export type { MembershipFilterFn } from '@harrier/core';

export type MembershipFilterItem = {
  name: string;
  filterFn: MembershipFilterFn;
};

export const useMembershipFilterMenu = (): MembershipFilterItem[] =>
  useMemo(
    () => [
      {
        name: 'Joined',
        filterFn: MembershipFilter.filterJoined,
      },
      {
        name: 'Invited',
        filterFn: MembershipFilter.filterInvited,
      },
      {
        name: 'Left',
        filterFn: MembershipFilter.filterLeaved,
      },
      {
        name: 'Kicked',
        filterFn: MembershipFilter.filterKicked,
      },
      {
        name: 'Banned',
        filterFn: MembershipFilter.filterBanned,
      },
    ],
    []
  );

export const useMembershipFilter = (
  index: number,
  membershipFilter: MembershipFilterItem[]
): MembershipFilterItem => {
  const filter = membershipFilter[index] ?? membershipFilter[0];
  return filter;
};
