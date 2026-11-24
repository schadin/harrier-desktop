import type { SessionView } from '@harrier/core';
import { useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useCoreSession = (): SessionView | null => {
  const core = useCore();
  const store = core.auth.session;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};

/** Preserves the runtime semantics of the former `mx.getUserId()!` reads. */
export const getSessionUserId = (session: SessionView | null): string => (session?.userId ?? null)!;

/** Safe string fallback for former `mx.getSafeUserId()` reads. */
export const getSafeSessionUserId = (session: SessionView | null): string => session?.userId ?? '';
