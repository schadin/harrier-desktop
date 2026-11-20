import type { DeviceView } from '@harrier/core';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export function useDeviceList(): [DeviceView[] | undefined, () => Promise<void>] {
  const core = useCore();
  const store = core.crypto.devices;
  const devices = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  const refreshDeviceList = useCallback(async () => {
    await core.crypto.refreshDevices();
  }, [core]);

  return [devices ? [...devices] : undefined, refreshDeviceList];
}

export const useDeviceIds = (devices: DeviceView[] | undefined): string[] =>
  useMemo(() => devices?.map((device) => device.deviceId) ?? [], [devices]);

export const useSplitCurrentDevice = (
  devices: DeviceView[] | undefined
): [DeviceView | undefined, DeviceView[] | undefined] =>
  useMemo(
    () => [
      devices?.find((device) => device.isCurrent),
      devices?.filter((device) => !device.isCurrent),
    ],
    [devices]
  );
