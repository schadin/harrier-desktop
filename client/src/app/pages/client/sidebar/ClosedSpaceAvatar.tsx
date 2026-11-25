import React from 'react';
import { Text } from 'folds';
import { RoomAvatar } from '../../../components/room-avatar';
import { SidebarAvatar } from '../../../components/sidebar';
import { useCore } from '../../../hooks/useCore';
import { useCoreRoom } from '../../../hooks/useCoreRoom';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { nameInitials } from '../../../utils/common';
import { getRoomAvatarUrl } from '../../../utils/room';

type ClosedSpaceAvatarProps = {
  roomId: string;
  name: string;
};

export function ClosedSpaceAvatar({ roomId, name }: ClosedSpaceAvatarProps) {
  const core = useCore();
  const room = useCoreRoom(roomId);
  const useAuthentication = useMediaAuthentication();
  const avatarUrl = room
    ? getRoomAvatarUrl(core, room, 96, useAuthentication) ?? undefined
    : undefined;

  return (
    <SidebarAvatar size="200" radii="300">
      <RoomAvatar
        roomId={roomId}
        src={avatarUrl}
        alt={name}
        renderFallback={() => (
          <Text size="Inherit">
            <b>{nameInitials(name, 2)}</b>
          </Text>
        )}
      />
    </SidebarAvatar>
  );
}
