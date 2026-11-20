import type { VerificationRequestView } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useIncomingVerification = (): VerificationRequestView | null => {
  const core = useCore();
  const store = core.crypto.verification.incoming;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};

export const useVerificationRequest = (id: string): VerificationRequestView | null => {
  const core = useCore();
  const store = useMemo(() => core.crypto.verification.view(id), [core, id]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};
