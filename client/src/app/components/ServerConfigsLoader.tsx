import type { AuthMetadataView, CapabilitiesView } from '@harrier/core';
import { ReactNode, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useCore } from '../hooks/useCore';
import { MediaConfig } from '../hooks/useMediaConfig';

export type ServerConfigs = {
  capabilities?: CapabilitiesView;
  mediaConfig?: MediaConfig;
  authMetadata?: AuthMetadataView | null;
};

type ServerConfigsLoaderProps = {
  children: (configs: ServerConfigs) => ReactNode;
};
export function ServerConfigsLoader({ children }: ServerConfigsLoaderProps) {
  const core = useCore();
  const capabilities = useSyncExternalStore(
    core.auth.capabilities.subscribe,
    core.auth.capabilities.getSnapshot,
    core.auth.capabilities.getSnapshot
  ).value;
  const mediaConfig = useSyncExternalStore(
    core.media.config.subscribe,
    core.media.config.getSnapshot,
    core.media.config.getSnapshot
  ).value;
  const authMetadata = useSyncExternalStore(
    core.auth.authMetadata.subscribe,
    core.auth.authMetadata.getSnapshot,
    core.auth.authMetadata.getSnapshot
  ).value;

  const refresh = useCallback(() => {
    core.auth.refreshCapabilities().catch(() => undefined);
    core.media.refreshConfig().catch(() => undefined);
    core.auth.refreshAuthMetadata().catch(() => undefined);
  }, [core]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return children({
    capabilities,
    mediaConfig: { 'm.upload.size': mediaConfig.maxUploadSize },
    authMetadata,
  });
}
