import React, { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useSelectedRoom } from '../../../hooks/router/useSelectedRoom';
import { IsDirectRoomProvider, RoomProvider } from '../../../hooks/useRoom';
import { useCoreRoom } from '../../../hooks/useCoreRoom';
import { JoinBeforeNavigate } from '../../../features/join-before-navigate';
import { useHomeRooms } from './useHomeRooms';
import { useSearchParamsViaServers } from '../../../hooks/router/useSearchParamsViaServers';

export function HomeRouteRoomProvider({ children }: { children: ReactNode }) {
  const rooms = useHomeRooms();

  const { roomIdOrAlias, eventId } = useParams();
  const viaServers = useSearchParamsViaServers();
  const roomId = useSelectedRoom();
  const room = useCoreRoom(roomId ?? '');

  if (!room || !rooms.includes(room.roomId)) {
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
      <IsDirectRoomProvider value={false}>{children}</IsDirectRoomProvider>
    </RoomProvider>
  );
}
