import type { HarrierCore, JsonObject, RoomStateEntry } from '@harrier/core';
import { ImagePack } from './ImagePack';
import { PackContent, EmoteRoomsContent, ImageUsage } from './types';
import { StateEvent } from '../../../types/matrix/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { PackMetaReader } from './PackMetaReader';
import { PackAddress } from './PackAddress';

export function packAddressEqual(a1?: PackAddress, a2?: PackAddress): boolean {
  if (!a1 && !a2) return true;
  if (!a1 || !a2) return false;
  return a1.roomId === a2.roomId && a1.stateKey === a2.stateKey;
}

export function imageUsageEqual(u1: ImageUsage[], u2: ImageUsage[]) {
  return u1.length === u2.length && u1.every((u) => u2.includes(u));
}

export function packMetaEqual(a: PackMetaReader, b: PackMetaReader): boolean {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.attribution === b.attribution &&
    imageUsageEqual(a.usage, b.usage)
  );
}

const imagePackFromState = (roomId: string, entry: RoomStateEntry): ImagePack =>
  new ImagePack(
    entry.eventId ?? `${roomId}|${entry.stateKey}`,
    entry.content as PackContent,
    new PackAddress(roomId, entry.stateKey)
  );

export function makeImagePacksFromState(
  roomId: string,
  entries: readonly RoomStateEntry[]
): ImagePack[] {
  return entries.map((entry) => imagePackFromState(roomId, entry));
}

export function getRoomImagePack(
  core: HarrierCore,
  roomId: string,
  stateKey: string
): ImagePack | undefined {
  const entry = core.rooms
    .stateList(roomId, StateEvent.PoniesRoomEmotes)
    .getSnapshot()
    .value.find((item) => item.stateKey === stateKey);
  return entry ? imagePackFromState(roomId, entry) : undefined;
}

export function getRoomImagePacks(core: HarrierCore, roomId: string): ImagePack[] {
  return makeImagePacksFromState(
    roomId,
    core.rooms.stateList(roomId, StateEvent.PoniesRoomEmotes).getSnapshot().value
  );
}

export function getGlobalImagePacks(
  core: HarrierCore,
  content?: unknown,
  stateByRoom?: ReadonlyMap<string, readonly RoomStateEntry[]>
): ImagePack[] {
  const emoteRoomsContent = (content === undefined
    ? core.auth.accountData(AccountDataEvent.PoniesEmoteRooms).getSnapshot().value
    : content) as unknown as EmoteRoomsContent | null;
  if (!emoteRoomsContent || typeof emoteRoomsContent !== 'object') return [];

  const { rooms: roomIdToPackInfo } = emoteRoomsContent;
  if (!roomIdToPackInfo || typeof roomIdToPackInfo !== 'object') return [];

  return Object.keys(roomIdToPackInfo).flatMap((roomId) => {
    const packStateKeyToUnknown = roomIdToPackInfo[roomId];
    if (!packStateKeyToUnknown || typeof packStateKeyToUnknown !== 'object') return [];
    if (!core.rooms.room(roomId).getSnapshot().value) return [];

    const entries =
      stateByRoom?.get(roomId) ??
      core.rooms.stateList(roomId, StateEvent.PoniesRoomEmotes).getSnapshot().value;
    return makeImagePacksFromState(
      roomId,
      entries.filter((entry) => !!packStateKeyToUnknown[entry.stateKey])
    );
  });
}

export function getUserImagePack(
  core: HarrierCore,
  content: JsonObject | null = core.auth
    .accountData(AccountDataEvent.PoniesUserEmotes)
    .getSnapshot().value
): ImagePack | undefined {
  const userId = core.auth.session.getSnapshot().value?.userId;
  if (!content || !userId) return undefined;

  return new ImagePack(userId, content as unknown as PackContent, undefined);
}
