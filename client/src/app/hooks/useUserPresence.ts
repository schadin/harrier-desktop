import type { PresenceView } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export enum Presence {
  Online = 'online',
  Unavailable = 'unavailable',
  Offline = 'offline',
}

export type UserPresence = {
  presence: Presence;
  status?: string;
  active: boolean;
  lastActiveTs?: number;
};

const toUserPresence = (view: PresenceView | null): UserPresence | undefined =>
  view
    ? {
        presence: view.status as Presence,
        status: view.statusMessage,
        active: view.active,
        lastActiveTs: view.lastActiveTs,
      }
    : undefined;

export const useUserPresence = (userId: string): UserPresence | undefined => {
  const core = useCore();
  const store = useMemo(() => core.presence.presence(userId), [core, userId]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  return useMemo(() => toUserPresence(view), [view]);
};

export const usePresenceLabel = (): Record<Presence, string> =>
  useMemo(
    () => ({
      [Presence.Online]: 'Active',
      [Presence.Unavailable]: 'Busy',
      [Presence.Offline]: 'Away',
    }),
    []
  );
