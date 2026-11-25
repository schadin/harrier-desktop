import { Atom, useAtomValue } from 'jotai';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { RoomSummaryView } from '@harrier/core';
import { getAllParents } from '../../utils/room';
import { useCore } from '../../hooks/useCore';
import { compareRoomsEqual } from '../room-list/utils';
import { RoomToParents } from '../../../types/matrix/room';

export type RoomsAtom = Atom<string[]>;
export type RoomClassification = Pick<RoomSummaryView, 'roomId' | 'isSpace' | 'roomType'>;
export type RoomSelector = (roomId: string, room: RoomClassification | null) => boolean | undefined;

const isRoomView = (room: RoomClassification | null): boolean => !!room && !room.isSpace;
const isSpaceView = (room: RoomClassification | null): boolean => !!room?.isSpace;
const isUnsupportedView = (room: RoomClassification | null): boolean => !!room && !room.roomType;

export const useSelectedRooms = (roomsAtom: RoomsAtom, selector: RoomSelector) => {
  const core = useCore();
  const roomIds = useAtomValue(roomsAtom);
  const summaries = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  ).value;
  const classifications = useMemo<ReadonlyMap<string, RoomClassification>>(
    () =>
      new Map(
        summaries.map((room) => [
          room.roomId,
          { roomId: room.roomId, isSpace: room.isSpace, roomType: room.roomType },
        ])
      ),
    [summaries]
  );
  const selected = useMemo(
    () => roomIds.filter((roomId) => selector(roomId, classifications.get(roomId) ?? null)),
    [roomIds, classifications, selector]
  );
  const cache = useRef(selected);

  if (!compareRoomsEqual(cache.current, selected)) cache.current = selected;
  return cache.current;
};

export type SpaceChildSelectorFactory = (parentId: string) => RoomSelector;

export const useRecursiveChildScopeFactory = (
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isRoomView(room) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [roomToParents]
  );

export const useChildSpaceScopeFactory = (
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isSpaceView(room) && roomToParents.get(roomId)?.has(parentId),
    [roomToParents]
  );

export const useRecursiveChildSpaceScopeFactory = (
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isSpaceView(room) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [roomToParents]
  );

export const useChildRoomScopeFactory = (
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isRoomView(room) && !mDirects.has(roomId) && roomToParents.get(roomId)?.has(parentId),
    [mDirects, roomToParents]
  );

export const useRecursiveChildRoomScopeFactory = (
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isRoomView(room) &&
      !mDirects.has(roomId) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mDirects, roomToParents]
  );

export const useChildDirectScopeFactory = (
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isRoomView(room) && mDirects.has(roomId) && roomToParents.get(roomId)?.has(parentId),
    [mDirects, roomToParents]
  );

export const useRecursiveChildDirectScopeFactory = (
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory =>
  useCallback(
    (parentId: string) => (roomId, room) =>
      isRoomView(room) &&
      mDirects.has(roomId) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mDirects, roomToParents]
  );

export const useSpaceChildren = (
  roomsAtom: RoomsAtom,
  spaceId: string,
  selectorFactory: SpaceChildSelectorFactory
) => {
  const recursiveChildRoomSelector = useMemo(
    () => selectorFactory(spaceId),
    [selectorFactory, spaceId]
  );
  return useSelectedRooms(roomsAtom, recursiveChildRoomSelector);
};

export const useSpaces = (roomsAtom: RoomsAtom) => {
  const selector: RoomSelector = useCallback((_roomId, room) => isSpaceView(room), []);
  return useSelectedRooms(roomsAtom, selector);
};

export const useOrphanSpaces = (roomsAtom: RoomsAtom, roomToParents: RoomToParents) => {
  const selector: RoomSelector = useCallback(
    (roomId, room) => isSpaceView(room) && !roomToParents.has(roomId),
    [roomToParents]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useRooms = (roomsAtom: RoomsAtom, mDirects: Set<string>) => {
  const selector: RoomSelector = useCallback(
    (roomId, room) => isRoomView(room) && !mDirects.has(roomId),
    [mDirects]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useOrphanRooms = (
  roomsAtom: RoomsAtom,
  mDirects: Set<string>,
  roomToParents: RoomToParents
) => {
  const selector: RoomSelector = useCallback(
    (roomId, room) => isRoomView(room) && !mDirects.has(roomId) && !roomToParents.has(roomId),
    [mDirects, roomToParents]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useDirects = (roomsAtom: RoomsAtom, mDirects: Set<string>) => {
  const selector: RoomSelector = useCallback(
    (roomId, room) => isRoomView(room) && mDirects.has(roomId),
    [mDirects]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useUnsupportedRooms = (roomsAtom: RoomsAtom) => {
  const selector: RoomSelector = useCallback((_roomId, room) => isUnsupportedView(room), []);
  return useSelectedRooms(roomsAtom, selector);
};
