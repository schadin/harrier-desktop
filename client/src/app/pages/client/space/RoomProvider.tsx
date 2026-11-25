import React, { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '../../../hooks/useRoom';
import { useCoreRoom } from '../../../hooks/useCoreRoom';
import { JoinBeforeNavigate } from '../../../features/join-before-navigate';
import { useCoreSpace } from '../../../hooks/useSpace';
import { getAllParents } from '../../../utils/room';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { useSearchParamsViaServers } from '../../../hooks/router/useSearchParamsViaServers';
import { mDirectAtom } from '../../../state/mDirectList';
import { settingsAtom } from '../../../state/settings';
import { useSetting } from '../../../state/hooks/settings';

export function SpaceRouteRoomProvider({ children }: { children: ReactNode }) {
  const space = useCoreSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useAtomValue(allRoomsAtom);

  const { roomIdOrAlias, eventId } = useParams();
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = useCoreRoom(roomId ?? '');

  if (!space || !room || !allRooms.includes(room.roomId)) {
    // room is not joined
    return (
      <JoinBeforeNavigate
        roomIdOrAlias={roomIdOrAlias!}
        eventId={eventId}
        viaServers={viaServers}
      />
    );
  }

  if (developerTools && room.isSpace && room.roomId === space.roomId) {
    // allow to view space timeline
    return (
      <RoomProvider key={room.roomId} value={room.roomId}>
        <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
      </RoomProvider>
    );
  }

  if (!getAllParents(roomToParents, room.roomId).has(space.roomId)) {
    return (
      <JoinBeforeNavigate
        roomIdOrAlias={roomIdOrAlias!}
        eventId={eventId}
        viaServers={viaServers}
      />
    );
  }

  return (
    <RoomProvider key={room.roomId} value={room.roomId}>
      <IsDirectRoomProvider value={mDirects.has(room.roomId)}>{children}</IsDirectRoomProvider>
    </RoomProvider>
  );
}
