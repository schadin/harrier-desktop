import { BackupProgressView } from '@harrier/core';
import { useSyncExternalStore } from 'react';
import { useCore } from '../hooks/useCore';

export const useBackupProgress = (): BackupProgressView => {
  const core = useCore();
  const store = core.crypto.backup.progress;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};
