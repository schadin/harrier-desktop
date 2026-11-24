import type { JsonObject } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export function useAccountData(eventType: string): JsonObject | null {
  const core = useCore();
  const store = useMemo(() => core.auth.accountData(eventType), [core, eventType]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
}
