import { useEffect, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useKeyBackupDecryptionKeyCached = (onCached: () => void) => {
  const core = useCore();
  useEffect(() => core.crypto.backup.onDecryptionKeyCached(onCached), [core, onCached]);
};

export const useKeyBackupStatus = () => {
  const core = useCore();
  const store = core.crypto.backup.status;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  return view.enabled;
};

export const useKeyBackupInfo = () => {
  const core = useCore();
  const store = core.crypto.backup.status;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  if (view.infoAbsent) return null;
  return view.version ? view : undefined;
};

export const useKeyBackupTrust = () => {
  const core = useCore();
  const store = core.crypto.backup.status;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  return view.trust;
};

export const useKeyBackupSync = (): [number, string | undefined] => {
  const core = useCore();
  const store = core.crypto.backup.status;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  return [view.sessionsRemaining, view.failure];
};
