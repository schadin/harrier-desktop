import type { HarrierCore, TimelineView } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export const useCoreTimeline = (roomId: string): TimelineView => {
  const core = useCore();
  const store = useMemo(() => core.timeline.timeline(roomId), [core, roomId]);
  const getSnapshot = useCallback(() => store.getSnapshot().value, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export const paginateCoreTimelineBackward = async (
  core: HarrierCore,
  roomId: string,
  limit: number
): Promise<void> => {
  const result = await core.timeline.paginateBackward(roomId, limit);
  if (!result.ok) throw result.error;
};

export const paginateCoreTimelineForward = async (
  core: HarrierCore,
  roomId: string,
  limit: number
): Promise<void> => {
  const result = await core.timeline.paginateForward(roomId, limit);
  if (!result.ok) throw result.error;
};

export const focusCoreEvent = async (
  core: HarrierCore,
  roomId: string,
  eventId: string
): Promise<number> => {
  const result = await core.timeline.focusEvent(roomId, eventId);
  if (!result.ok) throw result.error;
  return result.value;
};

export const clearCoreTimelineFocus = (core: HarrierCore, roomId: string): void => {
  core.timeline.clearFocus(roomId);
};
