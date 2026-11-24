import { atom, useSetAtom } from 'jotai';
import { useEffect, useSyncExternalStore } from 'react';
import { AccountDataEvent, SpacesSortContent } from '../../types/matrix/accountData';
import { useCore } from '../hooks/useCore';

export type SpaceSortAction = {
  type: 'INITIALIZE' | 'UPDATE';
  spacesSort: SpacesSortContent;
};

const baseSpaceSortAtom = atom<SpacesSortContent>({});
export const spaceSortAtom = atom<SpacesSortContent, [SpaceSortAction], undefined>(
  (get) => get(baseSpaceSortAtom),
  (get, set, action) => {
    set(baseSpaceSortAtom, action.spacesSort);
  }
);

export const useBindSpaceSortAtom = (spaceSort: typeof spaceSortAtom) => {
  const core = useCore();
  const setSpaceSort = useSetAtom(spaceSort);
  const store = core.auth.accountData(AccountDataEvent.SpacesSort);
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  useEffect(() => {
    setSpaceSort({
      type: 'UPDATE',
      spacesSort: (content ?? {}) as SpacesSortContent,
    });
  }, [content, setSpaceSort]);
};
