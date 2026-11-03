import { useMemo } from 'react';
import {
  getRoomPermissionsAPI as getCoreRoomPermissionsAPI,
  type IPowerLevels,
  type RoomPermissionsAPI,
} from '@harrier/core';

export type { RoomPermissionsAPI };

export const getRoomPermissionsAPI = (
  creators: Set<string> | readonly string[],
  powerLevels: IPowerLevels
): RoomPermissionsAPI => getCoreRoomPermissionsAPI(creators, powerLevels);

export const useRoomPermissions = (
  creators: Set<string> | readonly string[],
  powerLevels: IPowerLevels
): RoomPermissionsAPI => {
  const api: RoomPermissionsAPI = useMemo(
    () => getCoreRoomPermissionsAPI(creators, powerLevels),
    [creators, powerLevels]
  );

  return api;
};
