import type { DeviceTrust } from '@harrier/core';
import { useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export enum VerificationStatus {
  Unknown,
  Unverified,
  Verified,
  Unsupported,
}

const toVerificationStatus = (trust: DeviceTrust): VerificationStatus => {
  switch (trust) {
    case 'verified':
      return VerificationStatus.Verified;
    case 'unverified':
      return VerificationStatus.Unverified;
    case 'unsupported':
      return VerificationStatus.Unsupported;
    default:
      return VerificationStatus.Unknown;
  }
};

export const useDeviceVerificationStatus = (
  userId: string,
  deviceId?: string
): VerificationStatus => {
  const core = useCore();
  const store = useMemo(() => core.crypto.trust(userId, deviceId ?? ''), [core, userId, deviceId]);
  const trust = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;

  return toVerificationStatus(trust);
};

export const useUnverifiedDeviceCount = (
  userId: string,
  deviceIds: string[]
): number | undefined => {
  const core = useCore();
  const store = useMemo(
    () => core.crypto.unverifiedCount(userId, deviceIds),
    [core, userId, deviceIds]
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};
