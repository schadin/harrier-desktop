import { useSetAtom, WritableAtom } from 'jotai';
import { useEffect } from 'react';
import { compareRoomIdsEqual } from '@harrier/core';
import { Membership } from '../../../types/matrix/room';
import { useCore } from '../../hooks/useCore';

export type RoomsAction =
  | {
      type: 'INITIALIZE';
      rooms: string[];
    }
  | {
      type: 'PUT' | 'DELETE';
      roomId: string;
    };

export const useBindRoomsWithMembershipsAtom = (
  roomsAtom: WritableAtom<string[], [RoomsAction], undefined>,
  memberships: Membership[]
) => {
  const core = useCore();
  const setRoomsAtom = useSetAtom(roomsAtom);

  useEffect(() => {
    const store = core.rooms.all;
    const update = () => {
      setRoomsAtom({
        type: 'INITIALIZE',
        rooms: store
          .getSnapshot()
          .value.filter((room) => memberships.includes(room.membership as Membership))
          .map((room) => room.roomId),
      });
    };

    update();
    return store.subscribe(update);
  }, [core, memberships, setRoomsAtom]);
};

export const compareRoomsEqual = compareRoomIdsEqual;
