import { useCallback, useEffect } from 'react';
import { useAsyncCallback } from './useAsyncCallback';
import { useCore } from './useCore';

export const useRoomDirectoryVisibility = (roomId: string) => {
  const core = useCore();

  const [visibilityState, loadVisibility] = useAsyncCallback(
    useCallback(async () => {
      const result = await core.rooms.directoryVisibility(roomId);
      if (!result.ok) throw result.error;
      return result.value === 'public';
    }, [core, roomId])
  );

  useEffect(() => {
    loadVisibility();
  }, [loadVisibility]);

  const setVisibility = useCallback(
    async (visibility: boolean) => {
      const result = await core.rooms.setDirectoryVisibility(
        roomId,
        visibility ? 'public' : 'private'
      );
      if (!result.ok) throw result.error;
      await loadVisibility();
    },
    [core, roomId, loadVisibility]
  );

  return {
    visibilityState,
    setVisibility,
  };
};
