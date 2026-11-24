import React from 'react';
import { RoomSettings } from './RoomSettings';
import { Modal500 } from '../../components/Modal500';
import { useCloseRoomSettings, useRoomSettingsState } from '../../state/hooks/roomSettings';
import { useAllJoinedRoomsSet } from '../../hooks/useGetRoom';
import { useGetCoreRoom } from '../../hooks/useGetCoreRoom';
import { RoomSettingsState } from '../../state/roomSettings';
import { RoomProvider } from '../../hooks/useRoom';
import { SpaceProvider } from '../../hooks/useSpace';

type RenderSettingsProps = {
  state: RoomSettingsState;
};
function RenderSettings({ state }: RenderSettingsProps) {
  const { roomId, spaceId, page } = state;
  const closeSettings = useCloseRoomSettings();
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetCoreRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  if (!room) return null;

  return (
    <Modal500 requestClose={closeSettings}>
      <SpaceProvider value={space?.roomId ?? null}>
        <RoomProvider value={room.roomId}>
          <RoomSettings initialPage={page} requestClose={closeSettings} />
        </RoomProvider>
      </SpaceProvider>
    </Modal500>
  );
}

export function RoomSettingsRenderer() {
  const state = useRoomSettingsState();

  if (!state) return null;
  return <RenderSettings state={state} />;
}
