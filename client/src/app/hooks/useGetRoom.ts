import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';
import { allRoomsAtom } from '../state/room-list/roomList';
import { useMatrixClient } from './useMatrixClient';

export const useAllJoinedRoomsSet = () => {
  const allRooms = useAtomValue(allRoomsAtom);
  return useMemo(() => new Set(allRooms), [allRooms]);
};

type LegacyRoom = NonNullable<ReturnType<ReturnType<typeof useMatrixClient>['getRoom']>>;

export type GetRoomCallback = (roomId: string) => LegacyRoom | undefined;
export const useGetRoom = (rooms: Set<string>): GetRoomCallback => {
  const mx = useMatrixClient();
  return useCallback(
    (roomId: string) => (rooms.has(roomId) ? mx.getRoom(roomId) ?? undefined : undefined),
    [mx, rooms]
  );
};
