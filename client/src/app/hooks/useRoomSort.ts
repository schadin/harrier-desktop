import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { AccountDataEvent, RoomSortType, SpacesSortContent } from '../../types/matrix/accountData';
import { SortFunc, factoryRoomIdSort } from '../utils/sort';
import { useMatrixClient } from './useMatrixClient';
import { useCore } from './useCore';
import { settingsAtom } from '../state/settings';
import { spaceSortAtom } from '../state/spaceSort';
import { useSetting } from '../state/hooks/settings';

export type RoomSortItem = {
  type: RoomSortType;
  name: string;
};

export const useRoomSortMenu = (): RoomSortItem[] =>
  useMemo(
    () => [
      { type: 'manual', name: 'Manual' },
      { type: 'atoz', name: 'A to Z' },
      { type: 'ztoa', name: 'Z to A' },
      { type: 'activity_desc', name: 'Newest' },
      { type: 'activity_asc', name: 'Oldest' },
    ],
    []
  );

export const useSpaceRoomSort = (spaceId: string): RoomSortType => {
  const spacesSort = useAtomValue(spaceSortAtom);
  const [defaultSort] = useSetting(settingsAtom, 'roomSortDefault');
  return spacesSort[spaceId] ?? defaultSort;
};

export const useSetSpaceRoomSort = () => {
  const core = useCore();
  const setSpaceSort = useSetAtom(spaceSortAtom);

  return useCallback(
    async (spaceId: string, sortType: RoomSortType) => {
      const currentContent =
        (core.auth.accountData(AccountDataEvent.SpacesSort).getSnapshot()
          .value as SpacesSortContent | null) ?? {};
      const newContent: SpacesSortContent = { ...currentContent, [spaceId]: sortType };
      setSpaceSort({ type: 'UPDATE', spacesSort: newContent });
      const result = await core.auth.setAccountData(AccountDataEvent.SpacesSort, newContent);
      if (!result.ok) throw result.error;
    },
    [core, setSpaceSort]
  );
};

export const useRoomSortComparator = (): ((spaceId: string) => SortFunc<string> | undefined) => {
  const mx = useMatrixClient();
  const spacesSort = useAtomValue(spaceSortAtom);
  const [defaultSort] = useSetting(settingsAtom, 'roomSortDefault');

  return useCallback(
    (spaceId: string) => factoryRoomIdSort(mx, spacesSort[spaceId] ?? defaultSort),
    [mx, spacesSort, defaultSort]
  );
};
