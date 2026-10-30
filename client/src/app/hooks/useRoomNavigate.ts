import { useCallback } from 'react';
import { NavigateOptions, useNavigate } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpacePath,
  getSpaceRoomPath,
} from '../pages/pathUtils';
import { useMatrixClient } from './useMatrixClient';
import { getAllParents, getOrphanParents, guessPerfectParent } from '../utils/room';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { mDirectAtom } from '../state/mDirectList';
import { useSelectedSpace } from './router/useSelectedSpace';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';

export const useRoomNavigate = () => {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const spaceSelectedId = useSelectedSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  const navigateSpace = useCallback(
    (roomId: string) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      navigate(getSpacePath(roomIdOrAlias));
    },
    [mx, navigate]
  );

  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      const openSpaceTimeline = developerTools && spaceSelectedId === roomId;

      const allParents = openSpaceTimeline ? undefined : getAllParents(roomToParents, roomId);
      if (!openSpaceTimeline && spaceSelectedId && allParents?.has(spaceSelectedId)) {
        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, spaceSelectedId);
        navigate(getSpaceRoomPath(pSpaceIdOrAlias, roomIdOrAlias, eventId), opts);
        return;
      }

      const orphanParents = openSpaceTimeline ? [roomId] : getOrphanParents(roomToParents, roomId);
      if (orphanParents.length > 0) {
        const parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);

        navigate(
          getSpaceRoomPath(pSpaceIdOrAlias, openSpaceTimeline ? roomId : roomIdOrAlias, eventId),
          opts
        );
        return;
      }

      if (mDirects.has(roomId)) {
        navigate(getDirectRoomPath(roomIdOrAlias, eventId), opts);
        return;
      }

      navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
    },
    [mx, navigate, spaceSelectedId, roomToParents, mDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};
