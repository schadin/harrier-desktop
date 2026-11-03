import { useCallback, useMemo } from 'react';
import { sortMembersByPower, MemberSort } from '@harrier/core';
import type { MemberSortFn } from '@harrier/core';

export { MemberSort };
export type { MemberSortFn } from '@harrier/core';

export type MemberSortItem = {
  name: string;
  sortFn: MemberSortFn;
};

export const useMemberSortMenu = (): MemberSortItem[] =>
  useMemo(
    () => [
      {
        name: 'A to Z',
        sortFn: MemberSort.Ascending,
      },
      {
        name: 'Z to A',
        sortFn: MemberSort.Descending,
      },
      {
        name: 'Newest',
        sortFn: MemberSort.NewestFirst,
      },
      {
        name: 'Oldest',
        sortFn: MemberSort.Oldest,
      },
    ],
    []
  );

export const useMemberSort = (index: number, memberSort: MemberSortItem[]): MemberSortItem => {
  const item = memberSort[index] ?? memberSort[0];
  return item;
};

export const useMemberPowerSort = (
  creators: Set<string> | readonly string[],
  getPowerLevel: (userId: string) => number
): MemberSortFn => {
  const sort: MemberSortFn = useCallback(
    (a, b) => sortMembersByPower(a, b, creators, getPowerLevel),
    [creators, getPowerLevel]
  );

  return sort;
};
