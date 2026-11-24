import type { HarrierCore } from '@harrier/core';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useCallback } from 'react';
import { RoomType, StateEvent } from '../../../types/matrix/room';
import { useCore } from '../../hooks/useCore';
import { compareRoomsEqual } from '../room-list/utils';
import { allInvitesAtom } from '../room-list/inviteList';

const isDirectInvite = (core: HarrierCore, roomId: string): boolean => {
  const userId = core.auth.session.getSnapshot().value?.userId;
  if (!userId) return false;
  const membership = core.rooms
    .stateEntry(roomId, StateEvent.RoomMember, userId)
    .getSnapshot().value;
  return membership?.content.is_direct === true;
};

export const useSpaceInvites = (invitesAtom: typeof allInvitesAtom) => {
  const core = useCore();
  const selector = useCallback(
    (rooms: string[]) =>
      rooms.filter((roomId) => core.rooms.room(roomId).getSnapshot().value?.isSpace),
    [core]
  );
  return useAtomValue(selectAtom(invitesAtom, selector, compareRoomsEqual));
};

export const useRoomInvites = (invitesAtom: typeof allInvitesAtom, mDirects: Set<string>) => {
  const core = useCore();
  const selector = useCallback(
    (rooms: string[]) =>
      rooms.filter((roomId) => {
        const room = core.rooms.room(roomId).getSnapshot().value;
        return !!room && !room.isSpace && !(mDirects.has(roomId) || isDirectInvite(core, roomId));
      }),
    [core, mDirects]
  );
  return useAtomValue(selectAtom(invitesAtom, selector, compareRoomsEqual));
};

export const useDirectInvites = (invitesAtom: typeof allInvitesAtom, mDirects: Set<string>) => {
  const core = useCore();
  const selector = useCallback(
    (rooms: string[]) =>
      rooms.filter((roomId) => mDirects.has(roomId) || isDirectInvite(core, roomId)),
    [core, mDirects]
  );
  return useAtomValue(selectAtom(invitesAtom, selector, compareRoomsEqual));
};

export const useUnsupportedInvites = (invitesAtom: typeof allInvitesAtom) => {
  const core = useCore();
  const selector = useCallback(
    (rooms: string[]) =>
      rooms.filter((roomId) => {
        const room = core.rooms.room(roomId).getSnapshot().value;
        if (!room) return false;
        const create = core.rooms.stateEntry(roomId, StateEvent.RoomCreate).getSnapshot().value;
        return (
          !create || (create.content.type !== undefined && create.content.type !== RoomType.Space)
        );
      }),
    [core]
  );
  return useAtomValue(selectAtom(invitesAtom, selector, compareRoomsEqual));
};
