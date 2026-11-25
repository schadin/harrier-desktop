import { atom, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { unreadEqual, unreadInfoToUnread } from '@harrier/core';
import { RoomToUnread, UnreadInfo } from '../../../types/matrix/room';
import { useCore } from '../../hooks/useCore';

export type RoomToUnreadAction = {
  type: 'RESET';
  unreadInfos: UnreadInfo[];
};

export { unreadEqual, unreadInfoToUnread };

const baseRoomToUnread = atom<RoomToUnread>(new Map());
export const roomToUnreadAtom = atom<RoomToUnread, [RoomToUnreadAction], undefined>(
  (get) => get(baseRoomToUnread),
  (_get, set, action) => {
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
