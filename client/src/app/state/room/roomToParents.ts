import produce from 'immer';
import { atom, useSetAtom, useStore } from 'jotai';
import { useEffect } from 'react';
import { Membership, RoomToParents, StateEvent } from '../../../types/matrix/room';
import { mapParentWithChildren } from '../../utils/room';
import { useCore } from '../../hooks/useCore';

export const roomToParentsEqual = (current: RoomToParents, next: RoomToParents): boolean => {
  if (current.size !== next.size) return false;
  return Array.from(next).every(([roomId, parents]) => {
    const currentParents = current.get(roomId);
    return (
      !!currentParents &&
      currentParents.size === parents.size &&
      Array.from(parents).every((parentId) => currentParents.has(parentId))
    );
  });
};

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
      const current = get(baseRoomToParents);
      if (!roomToParentsEqual(current, action.roomToParents)) {
        set(baseRoomToParents, action.roomToParents);
      }
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
  const jotaiStore = useStore();
  const setRoomToParents = useSetAtom(roomToParents);

  useEffect(() => {
    const roomsStore = core.rooms.all;
    let active = true;
    let updateScheduled = false;
    const update = () => {
      const next: RoomToParents = new Map();
      const joinedRoomIds = new Set(
        roomsStore
          .getSnapshot()
          .value.filter((room) => room.membership === Membership.Join)
          .map((room) => room.roomId)
      );
      joinedRoomIds.forEach((roomId) => {
        const parents = core.rooms
          .parents(roomId)
          .getSnapshot()
          .value.filter((parentId) => joinedRoomIds.has(parentId));
        if (parents.length > 0) next.set(roomId, new Set(parents));
      });
      if (!roomToParentsEqual(jotaiStore.get(roomToParents), next)) {
        setRoomToParents({ type: 'INITIALIZE', roomToParents: next });
      }
    };

    const scheduleUpdate = () => {
      if (updateScheduled) return;
      updateScheduled = true;
      queueMicrotask(() => {
        updateScheduled = false;
        if (active) update();
      });
    };
    const unsubscribeRooms = roomsStore.subscribe(scheduleUpdate);
    const unsubscribeState = core.rooms.onState((entry) => {
      if (entry.eventType === StateEvent.SpaceChild) update();
    });

    update();
    return () => {
      active = false;
      unsubscribeRooms();
      unsubscribeState();
    };
  }, [core, roomToParents, setRoomToParents, jotaiStore]);
};
