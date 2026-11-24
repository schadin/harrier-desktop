import { createSnapshotStore, type CallParticipantView, type CallView } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

const emptyCallStore = createSnapshotStore<CallView | null>(null);

export const useCoreCallSession = (roomId: string): CallView | null => {
  const core = useCore();
  const store = useMemo(() => core.calls?.session(roomId) ?? emptyCallStore, [core, roomId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};

export const useCoreCallMembers = (roomId: string): readonly CallParticipantView[] =>
  useCoreCallSession(roomId)?.participants ?? [];
