import { atom, useSetAtom } from 'jotai';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { useEffect } from 'react';
import { AccountDataEvent, SpacesSortContent } from '../../types/matrix/accountData';
import { getAccountData } from '../utils/room';

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

export const useBindSpaceSortAtom = (mx: MatrixClient, spaceSort: typeof spaceSortAtom) => {
  const setSpaceSort = useSetAtom(spaceSort);

  useEffect(() => {
    const spacesSortEvent = getAccountData(mx, AccountDataEvent.SpacesSort);
    if (spacesSortEvent) {
      setSpaceSort({
        type: 'INITIALIZE',
        spacesSort: spacesSortEvent.getContent<SpacesSortContent>() ?? {},
      });
    }

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() === AccountDataEvent.SpacesSort) {
        setSpaceSort({
          type: 'UPDATE',
          spacesSort: event.getContent<SpacesSortContent>() ?? {},
        });
      }
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, setSpaceSort]);
};
