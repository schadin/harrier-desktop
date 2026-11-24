/* eslint-disable react-hooks/exhaustive-deps */
import { Atom, useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useCallback, useMemo } from 'react';
import { getAllParents } from '../../utils/room';
import { useCore } from '../../hooks/useCore';
import { compareRoomsEqual } from '../room-list/utils';
import { RoomToParents } from '../../../types/matrix/room';

export type RoomsAtom = Atom<string[]>;
export type RoomSelector = (roomId: string) => boolean | undefined;

const isRoomView = (room: { isSpace: boolean } | null): boolean => !!room && !room.isSpace;
const isSpaceView = (room: { isSpace: boolean } | null): boolean => !!room?.isSpace;
const isUnsupportedView = (room: { roomType?: string } | null): boolean => !!room && !room.roomType;

export const selectedRoomsAtom = (
  roomsAtom: RoomsAtom,
  selector: (roomId: string) => boolean | undefined
) => selectAtom(roomsAtom, (rooms) => rooms.filter(selector), compareRoomsEqual);

export const useSelectedRooms = (roomsAtom: RoomsAtom, selector: RoomSelector) => {
  const anAtom = useMemo(() => selectedRoomsAtom(roomsAtom, selector), [roomsAtom, selector]);

  return useAtomValue(anAtom);
};

export type SpaceChildSelectorFactory = (parentId: string) => RoomSelector;

export const useRecursiveChildScopeFactory = (
  mx: unknown,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mx, core, roomToParents]
  );
};

export const useChildSpaceScopeFactory = (
  mx: unknown,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isSpaceView(core.rooms.room(roomId).getSnapshot().value) &&
      roomToParents.get(roomId)?.has(parentId),
    [mx, core, roomToParents]
  );
};

export const useRecursiveChildSpaceScopeFactory = (
  mx: unknown,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isSpaceView(core.rooms.room(roomId).getSnapshot().value) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mx, core, roomToParents]
  );
};

export const useChildRoomScopeFactory = (
  mx: unknown,
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      !mDirects.has(roomId) &&
      roomToParents.get(roomId)?.has(parentId),
    [mx, core, mDirects, roomToParents]
  );
};

export const useRecursiveChildRoomScopeFactory = (
  mx: unknown,
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      !mDirects.has(roomId) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mx, core, mDirects, roomToParents]
  );
};

export const useChildDirectScopeFactory = (
  mx: unknown,
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      mDirects.has(roomId) &&
      roomToParents.get(roomId)?.has(parentId),
    [mx, core, mDirects, roomToParents]
  );
};

export const useRecursiveChildDirectScopeFactory = (
  mx: unknown,
  mDirects: Set<string>,
  roomToParents: RoomToParents
): SpaceChildSelectorFactory => {
  const core = useCore();
  return useCallback(
    (parentId: string) => (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      mDirects.has(roomId) &&
      roomToParents.has(roomId) &&
      getAllParents(roomToParents, roomId).has(parentId),
    [mx, core, mDirects, roomToParents]
  );
};

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

export const useSpaces = (mx: unknown, roomsAtom: RoomsAtom) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId) => isSpaceView(core.rooms.room(roomId).getSnapshot().value),
    [mx, core]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useOrphanSpaces = (
  mx: unknown,
  roomsAtom: RoomsAtom,
  roomToParents: RoomToParents
) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId) =>
      isSpaceView(core.rooms.room(roomId).getSnapshot().value) && !roomToParents.has(roomId),
    [mx, core, roomToParents]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useRooms = (mx: unknown, roomsAtom: RoomsAtom, mDirects: Set<string>) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId: string) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) && !mDirects.has(roomId),
    [mx, core, mDirects]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useOrphanRooms = (
  mx: unknown,
  roomsAtom: RoomsAtom,
  mDirects: Set<string>,
  roomToParents: RoomToParents
) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId) =>
      isRoomView(core.rooms.room(roomId).getSnapshot().value) &&
      !mDirects.has(roomId) &&
      !roomToParents.has(roomId),
    [mx, core, mDirects, roomToParents]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useDirects = (mx: unknown, roomsAtom: RoomsAtom, mDirects: Set<string>) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId) => isRoomView(core.rooms.room(roomId).getSnapshot().value) && mDirects.has(roomId),
    [mx, core, mDirects]
  );
  return useSelectedRooms(roomsAtom, selector);
};

export const useUnsupportedRooms = (mx: unknown, roomsAtom: RoomsAtom) => {
  const core = useCore();
  const selector: RoomSelector = useCallback(
    (roomId) => isUnsupportedView(core.rooms.room(roomId).getSnapshot().value),
    [mx, core]
  );
  return useSelectedRooms(roomsAtom, selector);
};
