import { ReactEventHandler, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomNavigate } from './useRoomNavigate';
import { useCore } from './useCore';
import { isRoomId, isUserId } from '../utils/matrix';
import { getHomeRoomPath, withSearchParam } from '../pages/pathUtils';
import { _RoomSearchParams } from '../pages/paths';
import { useOpenUserRoomProfile } from '../state/hooks/userRoomProfile';
import { useSpaceId } from './useSpace';

export const useMentionClickHandler = (roomId: string): ReactEventHandler<HTMLElement> => {
  const core = useCore();
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const navigate = useNavigate();
  const openProfile = useOpenUserRoomProfile();
  const spaceId = useSpaceId();

  const handleClick: ReactEventHandler<HTMLElement> = useCallback(
    (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      const target = evt.currentTarget;
      const mentionId = target.getAttribute('data-mention-id');
      if (typeof mentionId !== 'string') return;

      if (isUserId(mentionId)) {
        openProfile(roomId, spaceId ?? undefined, mentionId, target.getBoundingClientRect());
        return;
      }

      const eventId = target.getAttribute('data-mention-event-id') || undefined;
      const mentionRoom = isRoomId(mentionId)
        ? core.rooms.room(mentionId).getSnapshot().value
        : null;
      if (mentionRoom) {
        if (mentionRoom.isSpace) navigateSpace(mentionId);
        else navigateRoom(mentionId, eventId);
        return;
      }

      const viaServers = target.getAttribute('data-mention-via') || undefined;
      const path = getHomeRoomPath(mentionId, eventId);

      navigate(viaServers ? withSearchParam<_RoomSearchParams>(path, { viaServers }) : path);
    },
    [core, navigate, navigateRoom, navigateSpace, roomId, spaceId, openProfile]
  );

  return handleClick;
};
