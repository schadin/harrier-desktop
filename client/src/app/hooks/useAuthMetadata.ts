import type { AuthMetadataView } from '@harrier/core';
import { useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useAuthMetadata = (): AuthMetadataView | null => {
  const core = useCore();
  const store = core.auth.authMetadata;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};
