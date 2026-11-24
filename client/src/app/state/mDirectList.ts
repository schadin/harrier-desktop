import { atom, useSetAtom } from 'jotai';
import { useEffect, useSyncExternalStore } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { useCore } from '../hooks/useCore';

export type MDirectAction = {
  type: 'INITIALIZE' | 'UPDATE';
  rooms: Set<string>;
};

const baseMDirectAtom = atom(new Set<string>());
export const mDirectAtom = atom<Set<string>, [MDirectAction], undefined>(
  (get) => get(baseMDirectAtom),
  (get, set, action) => {
    set(baseMDirectAtom, action.rooms);
  }
);

export const useBindMDirectAtom = (mDirect: typeof mDirectAtom) => {
  const core = useCore();
  const setMDirect = useSetAtom(mDirect);
  const store = core.auth.accountData(AccountDataEvent.Direct);
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  useEffect(() => {
    const rooms = new Set<string>();
    Object.values(content ?? {}).forEach((value) => {
      if (Array.isArray(value)) value.forEach((roomId) => typeof roomId === 'string' && rooms.add(roomId));
    });
    setMDirect({ type: 'UPDATE', rooms });
  }, [content, setMDirect]);
};
