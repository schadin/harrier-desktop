import type { HarrierCore } from '@harrier/core';
import React, { useRef, useSyncExternalStore } from 'react';
import { Box, config, Line, Text } from 'folds';
import { ContainerColor } from '../../styles/ContainerColor.css';

type SyncStatusProps = {
  core: HarrierCore;
};
export function SyncStatus({ core }: SyncStatusProps) {
  const previous = useRef(core.auth.sync.getSnapshot().value.phase);
  const { value } = useSyncExternalStore(
    core.auth.sync.subscribe,
    core.auth.sync.getSnapshot,
    core.auth.sync.getSnapshot
  );
  const { phase } = value;
  const wasSyncing = previous.current === 'syncing';
  previous.current = phase;

  if ((phase === 'syncing' || phase === 'prepared') && !wasSyncing) {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Success' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connecting...</Text>
        </Box>
        <Line variant="Success" size="300" />
      </Box>
    );
  }

  if (phase === 'error') {
    return (
      <Box direction="Column" shrink="No">
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{ padding: `${config.space.S100} 0` }}
          alignItems="Center"
          justifyContent="Center"
        >
          <Text size="L400">Connection Lost!</Text>
        </Box>
        <Line variant="Critical" size="300" />
      </Box>
    );
  }

  return null;
}
