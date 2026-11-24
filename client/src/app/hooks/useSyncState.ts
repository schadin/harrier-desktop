import type { HarrierCore, SyncView } from '@harrier/core';
import { useEffect } from 'react';

export const useSyncState = (
  core: HarrierCore | undefined,
  onChange: (state: SyncView['phase']) => void
): void => {
  useEffect(
    () => core?.auth.sync.subscribe(() => onChange(core.auth.sync.getSnapshot().value.phase)),
    [core, onChange]
  );
};
