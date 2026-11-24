import { allInvitesAtom, useBindAllInvitesAtom } from '../room-list/inviteList';
import { allRoomsAtom, useBindAllRoomsAtom } from '../room-list/roomList';
import { mDirectAtom, useBindMDirectAtom } from '../mDirectList';
import { roomToUnreadAtom, useBindRoomToUnreadAtom } from '../room/roomToUnread';
import { roomToParentsAtom, useBindRoomToParentsAtom } from '../room/roomToParents';
import { spaceSortAtom, useBindSpaceSortAtom } from '../spaceSort';

export const useBindAtoms = () => {
  useBindMDirectAtom(mDirectAtom);
  useBindAllInvitesAtom(allInvitesAtom);
  useBindAllRoomsAtom(allRoomsAtom);
  useBindRoomToParentsAtom(roomToParentsAtom);
  useBindRoomToUnreadAtom(roomToUnreadAtom);
  useBindSpaceSortAtom(spaceSortAtom);
};
