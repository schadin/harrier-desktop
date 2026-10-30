import produce from 'immer';
import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { RoomToParents } from '../../../types/matrix/room';
import { mapParentWithChildren } from '../../utils/room';
import { useCore } from '../../hooks/useCore';

export type RoomToParentsAction =
  | {
      type: 'INITIALIZE';
      roomToParents: RoomToParents;
    }
  | {
      type: 'PUT';
      parent: string;
      children: string[];
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

const baseRoomToParents = atom<RoomToParents>(new Map());
export const roomToParentsAtom = atom<RoomToParents, [RoomToParentsAction], undefined>(
  (get) => get(baseRoomToParents),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomToParents, action.roomToParents);
      return;
    }
    if (action.type === 'PUT') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          mapParentWithChildren(draftRoomToParents, action.parent, action.children);
        })
      );
      return;
    }
    if (action.type === 'DELETE') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          const noParentRooms: string[] = [];
          draftRoomToParents.delete(action.roomId);
          draftRoomToParents.forEach((parents, child) => {
            parents.delete(action.roomId);
            if (parents.size === 0) noParentRooms.push(child);
          });
          noParentRooms.forEach((room) => draftRoomToParents.delete(room));
        })
      );
    }
  }
);

export const useBindRoomToParentsAtom = (roomToParents: typeof roomToParentsAtom) => {
  const core = useCore();
  const setRoomToParents = useSetAtom(roomToParents);

  useEffect(() => {
    const store = core.rooms.all;
    const update = () => {
      const next: RoomToParents = new Map();
      store
        .getSnapshot()
        .value.filter((room) => room.isSpace && room.membership !== 'invite')
        .forEach((room) => {
          const view = core.rooms.room(room.roomId).getSnapshot().value;
          mapParentWithChildren(next, room.roomId, [...(view?.spaceChildren ?? [])]);
        });
      setRoomToParents({ type: 'INITIALIZE', roomToParents: next });
    };

    update();
    return store.subscribe(update);
  }, [core, setRoomToParents]);
};
