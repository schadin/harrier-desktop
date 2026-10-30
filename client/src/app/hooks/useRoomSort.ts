import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { WritableAccountDataEvents } from 'matrix-js-sdk';
import { AccountDataEvent, RoomSortType, SpacesSortContent } from '../../types/matrix/accountData';
import { getAccountData } from '../utils/room';
import { SortFunc, factoryRoomIdSort } from '../utils/sort';
import { useMatrixClient } from './useMatrixClient';
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
  const mx = useMatrixClient();
  const setSpaceSort = useSetAtom(spaceSortAtom);

  return useCallback(
    async (spaceId: string, sortType: RoomSortType) => {
      const currentContent =
        getAccountData(mx, AccountDataEvent.SpacesSort)?.getContent<SpacesSortContent>() ?? {};
      const newContent: SpacesSortContent = { ...currentContent, [spaceId]: sortType };
      setSpaceSort({ type: 'UPDATE', spacesSort: newContent });
      await mx.setAccountData(
        AccountDataEvent.SpacesSort as keyof WritableAccountDataEvents,
        newContent
      );
    },
    [mx, setSpaceSort]
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
