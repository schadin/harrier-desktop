import type { CapabilitiesView } from '@harrier/core';
import { createContext, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

const CapabilitiesContext = createContext<CapabilitiesView | null>(null);

export const CapabilitiesProvider = CapabilitiesContext.Provider;

export function useCapabilities(): CapabilitiesView {
  const core = useCore();
  const store = core.auth.capabilities;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
}
