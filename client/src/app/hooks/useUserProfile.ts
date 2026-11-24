import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export type UserProfile = {
  avatarUrl?: string;
  displayName?: string;
};
export const useUserProfile = (userId: string): UserProfile => {
  const core = useCore();
  const store = useMemo(() => core.presence.profile(userId), [core, userId]);
  const profile = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  const refresh = useCallback(() => core.presence.refreshProfile(userId), [core, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { avatarUrl: profile.avatarUrl, displayName: profile.displayName };
};
