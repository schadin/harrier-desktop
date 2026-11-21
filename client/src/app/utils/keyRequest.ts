import type { HarrierCore, RoomId, EventId } from '@harrier/core';

export const requestRoomKey = async (
  core: HarrierCore,
  roomId: RoomId,
  eventId: EventId
): Promise<void> => {
  await core.crypto.backup.requestKey(roomId, eventId);
};
