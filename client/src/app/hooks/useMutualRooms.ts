import { useCallback } from 'react';
import { useCore } from './useCore';
import { AsyncState, useAsyncCallbackValue } from './useAsyncCallback';
import { useSpecVersions } from './useSpecVersions';

export const useUnstableMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();

  const supported =
    unstableFeatures?.['uk.half-shot.msc2666'] ||
    unstableFeatures?.['uk.half-shot.msc2666.mutual_rooms'] ||
    unstableFeatures?.['uk.half-shot.msc2666.query_mutual_rooms'];

  return !!supported;
};

export const useMutualRoomsSupport = (): boolean => {
  const { unstable_features: unstableFeatures, versions } = useSpecVersions();

  const supported =
    versions.includes('v1.19') ||
    unstableFeatures?.['uk.half-shot.msc2666.query_mutual_rooms.stable'];

  return !!supported;
};

export const useMutualRooms = (userId: string): AsyncState<string[], unknown> => {
  const core = useCore();
  const unstableSupport = useUnstableMutualRoomsSupport();
  const support = useMutualRoomsSupport();

  const [mutualRoomsState] = useAsyncCallbackValue(
    useCallback(async () => {
      if (!support && !unstableSupport) return [];
      const result = await core.rooms.mutualRooms(userId);
      if (!result.ok) throw result.error;
      return [...result.value];
    }, [core, userId, unstableSupport, support])
  );

  return mutualRoomsState;
};
