import type { HarrierCore, RoomView } from '@harrier/core';

/** Preserves the legacy DM lookup: joined, encrypted, <=2 loaded members, target present. */
export const getCoreDMRoomFor = (core: HarrierCore, userId: string): RoomView | undefined => {
  const summaries = core.rooms.all.getSnapshot().value;
  for (let index = 0; index < summaries.length; index += 1) {
    const summary = summaries[index];
    if (summary.membership === 'join') {
      const room = core.rooms.room(summary.roomId).getSnapshot().value;
      if (room?.encrypted) {
        const members = core.rooms.members(room.roomId).getSnapshot().value;
        if (members.length <= 2 && members.some((member) => member.userId === userId)) {
          return room;
        }
      }
    }
  }
  return undefined;
};
