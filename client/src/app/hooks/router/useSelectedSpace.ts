import { useMatch, useParams } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { isRoomAlias } from '../../utils/matrix';
import { useCore } from '../useCore';
import { getSpaceLobbyPath, getSpaceSearchPath } from '../../pages/pathUtils';

export const useSelectedSpace = (): string | undefined => {
  const core = useCore();
  const rooms = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  ).value;
  const { spaceIdOrAlias } = useParams();
  if (!spaceIdOrAlias || !isRoomAlias(spaceIdOrAlias)) return spaceIdOrAlias;
  return (
    rooms
      .map((room) => core.rooms.room(room.roomId).getSnapshot().value)
      .find((room) => room?.canonicalAlias === spaceIdOrAlias)?.roomId ?? spaceIdOrAlias
  );
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
