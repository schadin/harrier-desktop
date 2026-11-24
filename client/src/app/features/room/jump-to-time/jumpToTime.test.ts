import { describe, expect, it } from 'vitest';
import { findCoreTimelineEvent } from './jumpToTime';

const items = [
  { eventId: '$a', timestamp: 100 },
  { eventId: '$b', timestamp: 200 },
  { eventId: '$c', timestamp: 300 },
  { eventId: '$d', timestamp: 400 },
];

describe('findCoreTimelineEvent', () => {
  it('returns undefined for an empty core timeline', () => {
    expect(findCoreTimelineEvent([], 100)).toBeUndefined();
  });

  it('returns the event at the requested timestamp', () => {
    expect(findCoreTimelineEvent(items, 300)).toEqual(items[2]);
  });

  it('returns the first later event when the timestamp falls between events', () => {
    expect(findCoreTimelineEvent(items, 250)).toEqual(items[2]);
  });

  it('returns the newest loaded event when the timestamp follows the loaded range', () => {
    expect(findCoreTimelineEvent(items, 450)).toEqual(items[3]);
  });
});
