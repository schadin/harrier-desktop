import { useMatch, useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { isRoomAlias } from '../../utils/matrix';
import { getCanonicalAliasRoomId } from '../../utils/coreRoomNavigation';
import { useCore } from '../useCore';
import { useCoreRoomNavigationRevision } from '../useCoreRoomNavigation';
import { getSpaceLobbyPath, getSpaceSearchPath } from '../../pages/pathUtils';

export const useSelectedSpace = (): string | undefined => {
  const core = useCore();
  const rooms = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  ).value;
  useCoreRoomNavigationRevision();
  const { spaceIdOrAlias } = useParams();
  if (!spaceIdOrAlias || !isRoomAlias(spaceIdOrAlias)) return spaceIdOrAlias;
  const aliasedSpaceId = getCanonicalAliasRoomId(core, spaceIdOrAlias);
  return aliasedSpaceId && rooms.some((room) => room.roomId === aliasedSpaceId)
    ? aliasedSpaceId
    : spaceIdOrAlias;
};

export const useSpaceLobbySelected = (spaceIdOrAlias: string): boolean => {
  const match = useMatch({
    path: decodeURIComponent(getSpaceLobbyPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useSpaceSearchSelected = (spaceIdOrAlias: string): boolean => {
  const match = useMatch({
    path: decodeURIComponent(getSpaceSearchPath(spaceIdOrAlias)),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};
