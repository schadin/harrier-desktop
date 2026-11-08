import type { HarrierCore, TimelineItem, TimelineView } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
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

/**
 * Resolve a single timeline item by id through the core
 * (`timeline.event`): local timeline first, then the context transport.
 * Returns `undefined` while loading, `null` when the event does not exist.
 */
export const useCoreEvent = (
  roomId: string,
  eventId: string,
  enabled = true
): TimelineItem | undefined | null => {
  const core = useCore();
  const { data, error } = useQuery({
    enabled: enabled && eventId !== '',
    queryKey: ['core-event', roomId, eventId],
    queryFn: async () => {
      const result = await core.timeline.event(roomId, eventId);
      if (!result.ok) throw result.error;
      return result.value;
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000, // 1hour
  });

  if (!enabled) return undefined;
  if (error) return null;
  return data;
};
