import { useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useMediaAuthentication = (): boolean => {
  const core = useCore();
  const store = core.media.authenticated;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};
