import type { HarrierCore, RoomNotificationModeView } from '@harrier/core';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { Icons, IconSrc } from 'folds';
import { useAsyncCallback } from './useAsyncCallback';
import { useCore } from './useCore';

export type RoomsNotificationPreferences = {
  mute: Set<string>;
  specialMessages: Set<string>;
  allMessages: Set<string>;
};

const RoomsNotificationPreferencesContext = createContext<RoomsNotificationPreferences | null>(
  null
);
export const RoomsNotificationPreferencesProvider = RoomsNotificationPreferencesContext.Provider;

export const useRoomsNotificationPreferencesContext = (): RoomsNotificationPreferences => {
  const preferences = useContext(RoomsNotificationPreferencesContext);
  if (!preferences) throw new Error('No RoomsNotificationPreferences provided!');
  return preferences;
};

export const useRoomsNotificationPreferences = (): RoomsNotificationPreferences => {
  const core = useCore();
  const store = core.notifications.preferences;
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  return useMemo(
    () => ({
      mute: new Set(view.mute),
      specialMessages: new Set(view.specialMessages),
      allMessages: new Set(view.allMessages),
    }),
    [view]
  );
};

export enum RoomNotificationMode {
  Unset = 'Unset',
  Mute = 'Mute',
  SpecialMessages = 'SpecialMessages',
  AllMessages = 'AllMessages',
}

const toViewMode = (mode: RoomNotificationMode): RoomNotificationModeView => {
  switch (mode) {
    case RoomNotificationMode.Mute:
      return 'mute';
    case RoomNotificationMode.SpecialMessages:
      return 'special';
    case RoomNotificationMode.AllMessages:
      return 'all';
    default:
      return 'unset';
  }
};

export const getRoomNotificationMode = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode => {
  if (preferences.mute.has(roomId)) return RoomNotificationMode.Mute;
  if (preferences.specialMessages.has(roomId)) return RoomNotificationMode.SpecialMessages;
  if (preferences.allMessages.has(roomId)) return RoomNotificationMode.AllMessages;
  return RoomNotificationMode.Unset;
};

export const useRoomNotificationPreference = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode =>
  useMemo(() => getRoomNotificationMode(preferences, roomId), [preferences, roomId]);

export const getRoomNotificationModeIcon = (mode?: RoomNotificationMode): IconSrc => {
  if (mode === RoomNotificationMode.Mute) return Icons.BellMute;
  if (mode === RoomNotificationMode.SpecialMessages) return Icons.BellPing;
  if (mode === RoomNotificationMode.AllMessages) return Icons.BellRing;
  return Icons.Bell;
};

export const setRoomNotificationPreference = async (
  core: HarrierCore,
  roomId: string,
  mode: RoomNotificationMode,
  previousMode: RoomNotificationMode
): Promise<void> => {
  const result = await core.notifications.setRoomMode(
    roomId,
    toViewMode(mode),
    toViewMode(previousMode)
  );
  if (!result.ok) throw result.error;
};

export const useSetRoomNotificationPreference = (roomId: string) => {
  const core = useCore();

  const [modeState, setMode] = useAsyncCallback(
    useCallback(
      (mode: RoomNotificationMode, previousMode: RoomNotificationMode) =>
        setRoomNotificationPreference(core, roomId, mode, previousMode),
      [core, roomId]
    )
  );

  return { modeState, setMode };
};
