import { atom } from 'jotai';
import { useMemo } from 'react';
import { compareRoomIdsEqual } from '@harrier/core';
import { Membership } from '../../../types/matrix/room';
import { RoomsAction, useBindRoomsWithMembershipsAtom } from './utils';

const baseRoomsAtom = atom<string[]>([]);
export const allRoomsAtom = atom<string[], [RoomsAction], undefined>(
  (get) => get(baseRoomsAtom),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      const current = get(baseRoomsAtom);
      if (!compareRoomIdsEqual(current, action.rooms)) set(baseRoomsAtom, action.rooms);
      return;
    }
    set(baseRoomsAtom, (ids) => {
      if (action.type === 'PUT' && ids.includes(action.roomId)) return ids;
      if (action.type === 'DELETE' && !ids.includes(action.roomId)) return ids;
      const newIds = ids.filter((id) => id !== action.roomId);
      if (action.type === 'PUT') newIds.push(action.roomId);
      return newIds;
    });
  }
);
export const useBindAllRoomsAtom = (allRooms: typeof allRoomsAtom) => {
  useBindRoomsWithMembershipsAtom(
    allRooms,
    useMemo(() => [Membership.Join], [])
  );
};
