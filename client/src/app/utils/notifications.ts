import type { HarrierCore } from '@harrier/core';

export async function markAsRead(core: HarrierCore, roomId: string, privateReceipt: boolean) {
  const timeline = core.timeline.timeline(roomId).getSnapshot().value;
  const { readUpTo: readEventId, items } = timeline;

  const getLatestValidItem = () => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item.eventId === readEventId) return undefined;
      if (item.kind === 'message' && item.status === 'sending') {
        // eslint-disable-next-line no-continue -- skip local echoes that are still sending
        continue;
      }
      return item;
    }
    return undefined;
  };
  if (items.length === 0) return;
  const latestItem = getLatestValidItem();
  if (!latestItem) return;

  await core.timeline.markRead(roomId, latestItem.eventId, privateReceipt);
}
