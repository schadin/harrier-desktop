import { useMemo } from 'react';
import { useCoreTimeline } from './useCoreTimeline';

export const useRoomEventReaders = (roomId: string, eventId?: string): string[] => {
  const timeline = useCoreTimeline(roomId);

  return useMemo(() => {
    if (!eventId?.startsWith('$')) return [];
    const index = timeline.items.findIndex((item) => item.eventId === eventId);
    if (index < 0) return [];
    const readers = new Set<string>();
    timeline.items.slice(index).forEach((item) => {
      if (item.kind === 'message') item.readBy?.forEach((userId) => readers.add(userId));
    });
    return [...readers];
  }, [timeline.items, eventId]);
};
