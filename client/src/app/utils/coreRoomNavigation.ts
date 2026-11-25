import type { HarrierCore } from '@harrier/core';
import { StateEvent } from '../../types/matrix/room';
import { isRoomAlias } from './matrix';

const isTombstoned = (core: HarrierCore, roomId: string): boolean =>
  core.rooms.stateEntry(roomId, StateEvent.RoomTombstone).getSnapshot().value !== null;

export const getCanonicalAliasRoomId = (core: HarrierCore, alias: string): string | undefined =>
  core.rooms.all.getSnapshot().value.find(({ roomId }) => {
    const room = core.rooms.room(roomId).getSnapshot().value;
    return room?.canonicalAlias === alias && !isTombstoned(core, roomId);
  })?.roomId;

export const getCanonicalAliasOrRoomId = (
  core: HarrierCore,
  roomId: string,
  candidateRoomIds?: readonly string[]
): string => {
  const room = core.rooms.room(roomId).getSnapshot().value;
  if (!room || isTombstoned(core, roomId) || !room.canonicalAlias) return roomId;

  const candidates =
    candidateRoomIds ?? core.rooms.all.getSnapshot().value.map((candidate) => candidate.roomId);
  const aliasedRoomId = candidates.find((candidateId) => {
    const candidate = core.rooms.room(candidateId).getSnapshot().value;
    return candidate?.canonicalAlias === room.canonicalAlias && !isTombstoned(core, candidateId);
  });

  return aliasedRoomId === roomId ? room.canonicalAlias : roomId;
};

export const resolveJoinedRoomId = (
  core: HarrierCore,
  joinedRoomIds: readonly string[],
  roomIdOrAlias: string
): string | undefined => {
  const roomId = isRoomAlias(roomIdOrAlias)
    ? getCanonicalAliasRoomId(core, roomIdOrAlias)
    : roomIdOrAlias;

  return roomId && joinedRoomIds.includes(roomId) ? roomId : undefined;
};

const getSpecialUsers = (core: HarrierCore, roomId: string): Set<string> => {
  const specialUsers = new Set(core.rooms.creators(roomId).getSnapshot().value);
  const create = core.rooms.stateEntry(roomId, StateEvent.RoomCreate).getSnapshot().value;
  if (typeof create?.sender === 'string') specialUsers.add(create.sender);
  if (Array.isArray(create?.content.additional_creators)) {
    create.content.additional_creators.forEach((creator) => {
      if (typeof creator === 'string') specialUsers.add(creator);
    });
  }

  const powerLevels = core.rooms.powerLevels(roomId).getSnapshot().value;
  const defaultPower = powerLevels.users_default ?? 0;
  if (powerLevels.users && typeof powerLevels.users === 'object') {
    Object.entries(powerLevels.users).forEach(([userId, powerLevel]) => {
      if (powerLevel > defaultPower) specialUsers.add(userId);
    });
  }

  return specialUsers;
};

export const guessPerfectParent = (
  core: HarrierCore,
  roomId: string,
  parents: readonly string[]
): string | undefined => {
  if (parents.length === 1) return parents[0];

  const roomSpecialUsers = getSpecialUsers(core, roomId);
  let perfectParent: string | undefined;
  let score = 0;

  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(core, parentId);
    const matchedUsersCount = [...parentSpecialUsers].filter((userId) =>
      roomSpecialUsers.has(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};
