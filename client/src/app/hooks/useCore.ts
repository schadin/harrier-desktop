import type { HarrierCore } from '@harrier/core';
import { createContext, useContext } from 'react';

const CoreContext = createContext<HarrierCore | null>(null);

export const CoreProvider = CoreContext.Provider;

export function useCore(): HarrierCore {
  const core = useContext(CoreContext);
  if (!core) throw new Error('HarrierCore not initialized!');
  return core;
}
