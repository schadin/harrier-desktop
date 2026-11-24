import React from 'react';
import { SpaceSettings } from './SpaceSettings';
import { Modal500 } from '../../components/Modal500';
import { useCloseSpaceSettings, useSpaceSettingsState } from '../../state/hooks/spaceSettings';
import { useAllJoinedRoomsSet } from '../../hooks/useGetRoom';
import { useGetCoreRoom } from '../../hooks/useGetCoreRoom';
import { SpaceSettingsState } from '../../state/spaceSettings';
import { RoomProvider } from '../../hooks/useRoom';
import { SpaceProvider } from '../../hooks/useSpace';

type RenderSettingsProps = {
  state: SpaceSettingsState;
};
function RenderSettings({ state }: RenderSettingsProps) {
  const { roomId, spaceId, page } = state;
  const closeSettings = useCloseSpaceSettings();
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetCoreRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId && spaceId !== roomId ? getRoom(spaceId) : undefined;

  if (!room) return null;

  return (
    <Modal500 requestClose={closeSettings}>
      <SpaceProvider value={space?.roomId ?? null}>
        <RoomProvider value={room.roomId}>
          <SpaceSettings initialPage={page} requestClose={closeSettings} />
        </RoomProvider>
      </SpaceProvider>
    </Modal500>
  );
}

export function SpaceSettingsRenderer() {
  const state = useSpaceSettingsState();

  if (!state) return null;
  return <RenderSettings state={state} />;
}
