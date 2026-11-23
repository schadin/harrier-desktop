import type { CapabilitiesView } from '@harrier/core';
import { ReactNode } from 'react';
import { useCore } from '../hooks/useCore';

type CapabilitiesLoaderProps = {
  children: (capabilities: CapabilitiesView | undefined) => ReactNode;
};
export function CapabilitiesLoader({ children }: CapabilitiesLoaderProps) {
  const core = useCore();
  return children(core.auth.capabilities.getSnapshot().value);
}
