import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import {
  deleteUnreadInfo as coreDeleteUnreadInfo,
  putUnreadInfo as corePutUnreadInfo,
  unreadEqual,
  unreadInfoToUnread,
} from '@harrier/core';
import { RoomToUnread, UnreadInfo } from '../../../types/matrix/room';
import { getAllParents } from '../../utils/room';
import { useCore } from '../../hooks/useCore';
import { roomToParentsAtom } from './roomToParents';

export type RoomToUnreadAction =
  | {
      type: 'RESET';
      unreadInfos: UnreadInfo[];
    }
  | {
      type: 'PUT';
      unreadInfo: UnreadInfo;
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

export { unreadEqual, unreadInfoToUnread };

const baseRoomToUnread = atom<RoomToUnread>(new Map());
export const roomToUnreadAtom = atom<RoomToUnread, [RoomToUnreadAction], undefined>(
  (get) => get(baseRoomToUnread),
  (get, set, action) => {
    if (action.type === 'RESET') {
      set(
        baseRoomToUnread,
        new Map(
          action.unreadInfos.map((unreadInfo) => [
            unreadInfo.roomId,
            unreadInfoToUnread(unreadInfo),
          ])
        ) as RoomToUnread
      );
      return;
    }
    if (action.type === 'PUT') {
      const { unreadInfo } = action;
      const currentUnread = get(baseRoomToUnread).get(unreadInfo.roomId);
      if (currentUnread && unreadEqual(currentUnread, unreadInfoToUnread(unreadInfo))) {
        // Do not update if unread data has not changes
        // like total & highlight
        return;
      }
      set(
        baseRoomToUnread,
        corePutUnreadInfo(
          get(baseRoomToUnread),
          getAllParents(get(roomToParentsAtom), unreadInfo.roomId),
          unreadInfo
        ) as RoomToUnread
      );
      return;
    }
    if (action.type === 'DELETE' && get(baseRoomToUnread).has(action.roomId)) {
      set(
        baseRoomToUnread,
        coreDeleteUnreadInfo(
          get(baseRoomToUnread),
          getAllParents(get(roomToParentsAtom), action.roomId),
          action.roomId
        ) as RoomToUnread
      );
    }
  }
);

export const useBindRoomToUnreadAtom = (unreadAtom: typeof roomToUnreadAtom) => {
  const core = useCore();
  const setUnreadAtom = useSetAtom(unreadAtom);

  useEffect(() => {
    const store = core.rooms.unreads;
    const update = () => {
      setUnreadAtom({
        type: 'RESET',
        unreadInfos: store.getSnapshot().value.map(({ roomId, unread }) => ({ roomId, ...unread })),
      });
    };

    update();
    return store.subscribe(update);
  }, [core, setUnreadAtom]);
};
