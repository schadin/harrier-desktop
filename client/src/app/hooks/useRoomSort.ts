import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AccountDataEvent, RoomSortType, SpacesSortContent } from '../../types/matrix/accountData';
import type { RoomSortSource, SortFunc } from '../utils/sort';
import { factoryRoomIdSort } from '../utils/sort';
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

export const useRoomSortSource = (): RoomSortSource => {
  const core = useCore();
  const snapshot = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  );

  return useMemo(() => {
    const roomsById = new Map(snapshot.value.map((room) => [room.roomId, room]));
    return {
      getRoom: (roomId: string) => roomsById.get(roomId) ?? null,
    };
  }, [snapshot]);
};

export const useRoomSortComparator = (): ((spaceId: string) => SortFunc<string> | undefined) => {
  const source = useRoomSortSource();
  const spacesSort = useAtomValue(spaceSortAtom);
  const [defaultSort] = useSetting(settingsAtom, 'roomSortDefault');

  return useCallback(
    (spaceId: string) => factoryRoomIdSort(source, spacesSort[spaceId] ?? defaultSort),
    [source, spacesSort, defaultSort]
  );
};
