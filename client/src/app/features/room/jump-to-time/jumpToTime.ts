import type { TimelineItem } from '@harrier/core';

export type CoreTimelineEvent = Pick<TimelineItem, 'eventId' | 'timestamp'>;

export const findCoreTimelineEvent = (
  items: readonly CoreTimelineEvent[],
  ts: number
): CoreTimelineEvent | undefined => {
  if (items.length === 0) return undefined;

  let low = 0;
  let high = items.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].timestamp < ts) low = middle + 1;
    else {
      found = middle;
      high = middle - 1;
    }
  }
  return items[found === -1 ? items.length - 1 : found];
};
