import React, { useCallback } from 'react';
import { Box, Button, Spinner, Text, color } from 'folds';
import type { CoreError } from '@harrier/core';
import { useCore } from '../../hooks/useCore';
import { useCoreRoom } from '../../hooks/useCoreRoom';

import * as css from './RoomTombstone.css';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { Membership } from '../../../types/matrix/room';
import { RoomInputPlaceholder } from './RoomInputPlaceholder';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { getViaServers } from '../../plugins/via-servers';
import { joinRoom } from '../../utils/coreRoomActions';

type RoomTombstoneProps = { roomId: string; body?: string; replacementRoomId: string };
export function RoomTombstone({ roomId, body, replacementRoomId }: RoomTombstoneProps) {
  const core = useCore();
  const replacementRoom = useCoreRoom(replacementRoomId);
  const { navigateRoom } = useRoomNavigate();

  const [joinState, handleJoin] = useAsyncCallback<string, CoreError, []>(
    useCallback(
      () => joinRoom(core, replacementRoomId, getViaServers(core, roomId)),
      [core, roomId, replacementRoomId]
    )
  );

  const handleOpen = () => {
    if (replacementRoom) navigateRoom(replacementRoom.roomId);
    if (joinState.status === AsyncStatus.Success) navigateRoom(joinState.data);
  };

  return (
    <RoomInputPlaceholder alignItems="Center" gap="600" className={css.RoomTombstone}>
      <Box direction="Column" grow="Yes">
        <Text size="T400">{body || 'This room has been replaced and is no longer active.'}</Text>
        {joinState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(joinState.error as Error)?.message ?? 'Failed to join replacement room!'}
          </Text>
        )}
      </Box>
      <Box shrink="No">
        {replacementRoom?.membership === Membership.Join ||
        joinState.status === AsyncStatus.Success ? (
          <Button onClick={handleOpen} size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Open New Room</Text>
          </Button>
        ) : (
          <Button
            onClick={handleJoin}
            size="300"
            variant="Primary"
            fill="Solid"
            radii="300"
            before={
              joinState.status === AsyncStatus.Loading && (
                <Spinner size="100" variant="Primary" fill="Solid" />
              )
            }
            disabled={joinState.status === AsyncStatus.Loading}
          >
            <Text size="B300">Join New Room</Text>
          </Button>
        )}
      </Box>
    </RoomInputPlaceholder>
  );
}
