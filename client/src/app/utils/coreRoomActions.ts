import type { CoreResult, HarrierCore, JsonObject } from '@harrier/core';
import { AccountDataEvent } from '../../types/matrix/accountData';

export const unwrapCoreResult = async <T>(
  result: CoreResult<T> | Promise<CoreResult<T>>
): Promise<T> => {
  const resolved = await result;
  if (!resolved.ok) throw resolved.error;
  return resolved.value;
};

export const joinRoom = (
  core: HarrierCore,
  roomIdOrAlias: string,
  viaServers?: readonly string[]
) => unwrapCoreResult(core.rooms.join(roomIdOrAlias, viaServers));

export const leaveRoom = (core: HarrierCore, roomId: string) =>
  unwrapCoreResult(core.rooms.leave(roomId));

export const setAccountData = (core: HarrierCore, type: string, content: JsonObject) =>
  unwrapCoreResult(core.auth.setAccountData(type, content));

export const addRoomIdToMDirect = async (
  core: HarrierCore,
  roomId: string,
  userId: string
): Promise<void> => {
  const current = core.auth.accountData(AccountDataEvent.Direct).getSnapshot().value;
  const next: JsonObject = structuredClone(current ?? {});

  Object.entries(next).forEach(([targetUserId, roomIds]) => {
    if (targetUserId === userId || !Array.isArray(roomIds)) return;
    next[targetUserId] = roomIds.filter((id) => id !== roomId);
  });

  const currentDirectRoomIds = next[userId];
  const directRoomIds = Array.isArray(currentDirectRoomIds) ? [...currentDirectRoomIds] : [];
  if (!directRoomIds.includes(roomId)) directRoomIds.push(roomId);
  next[userId] = directRoomIds;

  await setAccountData(core, AccountDataEvent.Direct, next);
};

export const createPrivateRoomAndInvite = async (
  core: HarrierCore,
  options: { userId: string; encrypted: boolean; version: string }
): Promise<string> => {
  const roomId = await unwrapCoreResult(
    core.rooms.createRoom({
      version: options.version,
      access: 'private',
      knock: false,
      name: '',
      encryption: options.encrypted,
      allowFederation: true,
    })
  );
  await unwrapCoreResult(core.rooms.invite(roomId, options.userId));
  await addRoomIdToMDirect(core, roomId, options.userId);
  return roomId;
};

export const setIgnoredUsers = async (core: HarrierCore, userIds: string[]): Promise<void> => {
  const ignoredUsers: JsonObject = {};
  userIds.forEach((userId) => {
    ignoredUsers[userId] = {};
  });
  await setAccountData(core, AccountDataEvent.IgnoredUserList, { ignored_users: ignoredUsers });
};

export const getCoreErrorData = (error: unknown): Record<string, unknown> | undefined => {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const { data } = error;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
};
