import type { CoreError } from '@harrier/core';
import { useCallback, useEffect, useMemo } from 'react';
import { AsyncState, useAsyncCallback } from './useAsyncCallback';
import { useAlive } from './useAlive';
import { useCore } from './useCore';
import { sendRoomState, useCoreRoomState } from './useCoreRoomState';
import { StateEvent } from '../../types/matrix/room';

type RoomWithId = { roomId: string };
type CanonicalAliasContent = { alias?: string; alt_aliases?: string[] };

export const usePublishedAliases = (room: RoomWithId): [string | undefined, string[]] => {
  const aliasContent = useCoreRoomState<CanonicalAliasContent>(room, StateEvent.RoomCanonicalAlias);

  const canonicalAlias = aliasContent?.alias;

  const publishedAliases = useMemo(() => {
    const aliases: string[] = [];
    if (typeof aliasContent?.alias === 'string') aliases.push(aliasContent.alias);
    aliasContent?.alt_aliases?.forEach((alias) => {
      if (typeof alias === 'string') aliases.push(alias);
    });
    return aliases;
  }, [aliasContent]);

  return [canonicalAlias, publishedAliases];
};

export const useSetMainAlias = (
  room: RoomWithId
): ((alias: string | undefined) => Promise<void>) => {
  const core = useCore();
  const aliasContent = useCoreRoomState<CanonicalAliasContent>(room, StateEvent.RoomCanonicalAlias);
  const mainAlias = useCallback(
    async (alias: string | undefined) => {
      const altAliases: string[] = [];
      if (aliasContent?.alias && aliasContent.alias !== alias) altAliases.push(aliasContent.alias);
      aliasContent?.alt_aliases?.forEach((a) => {
        if (a !== alias) altAliases.push(a);
      });
      await sendRoomState(
        core,
        room.roomId,
        StateEvent.RoomCanonicalAlias,
        { alias, alt_aliases: altAliases },
        ''
      );
    },
    [core, room.roomId, aliasContent]
  );

  return mainAlias;
};

export const usePublishUnpublishAliases = (
  room: RoomWithId
): {
  publishAliases: (aliases: string[]) => Promise<void>;
  unpublishAliases: (aliases: string[]) => Promise<void>;
} => {
  const core = useCore();
  const aliasContent = useCoreRoomState<CanonicalAliasContent>(room, StateEvent.RoomCanonicalAlias);
  const publishAliases = useCallback(
    async (aliases: string[]) => {
      const altAliases = [...(aliasContent?.alt_aliases ?? [])];
      aliases.forEach((alias) => {
        if (!altAliases.includes(alias)) altAliases.push(alias);
      });
      await sendRoomState(
        core,
        room.roomId,
        StateEvent.RoomCanonicalAlias,
        { alias: aliasContent?.alias, alt_aliases: altAliases },
        ''
      );
    },
    [core, room.roomId, aliasContent]
  );

  const unpublishAliases = useCallback(
    async (aliases: string[]) => {
      const altAliases = (aliasContent?.alt_aliases ?? []).filter(
        (alias) => !aliases.includes(alias)
      );
      await sendRoomState(
        core,
        room.roomId,
        StateEvent.RoomCanonicalAlias,
        { alias: aliasContent?.alias, alt_aliases: altAliases },
        ''
      );
    },
    [core, room.roomId, aliasContent]
  );

  return { publishAliases, unpublishAliases };
};

export const useLocalAliases = (
  roomId: string
): {
  localAliasesState: AsyncState<string[], CoreError>;
  addLocalAlias: (alias: string) => Promise<void>;
  removeLocalAlias: (alias: string) => Promise<void>;
} => {
  const core = useCore();
  const alive = useAlive();

  const [aliasesState, loadAliases] = useAsyncCallback<string[], CoreError, []>(
    useCallback(async () => {
      const result = await core.rooms.aliases(roomId);
      if (!result.ok) throw result.error;
      return [...result.value.local];
    }, [core, roomId])
  );

  useEffect(() => {
    loadAliases();
  }, [loadAliases]);

  const addLocalAlias = useCallback(
    async (alias: string) => {
      const result = await core.rooms.createAlias(alias, roomId);
      if (!result.ok) throw result.error;
      if (alive()) await loadAliases();
    },
    [core, roomId, loadAliases, alive]
  );

  const removeLocalAlias = useCallback(
    async (alias: string) => {
      const result = await core.rooms.deleteAlias(alias);
      if (!result.ok) throw result.error;
      if (alive()) await loadAliases();
    },
    [core, loadAliases, alive]
  );

  return {
    localAliasesState: aliasesState,
    addLocalAlias,
    removeLocalAlias,
  };
};
