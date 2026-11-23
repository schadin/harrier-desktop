import type { HarrierCore, RoomId } from '@harrier/core';

export const getViaServers = (core: HarrierCore, roomId: RoomId): string[] => [
  ...core.rooms.viaServers(roomId),
];
