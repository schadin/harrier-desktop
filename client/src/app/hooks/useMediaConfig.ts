import { createContext, useSyncExternalStore } from 'react';
import { useCore } from './useCore';

export interface MediaConfig {
  [key: string]: unknown;
  'm.upload.size'?: number;
}

export const MediaConfigContext = createContext<MediaConfig | null>(null);
export const MediaConfigProvider = MediaConfigContext.Provider;

export function useMediaConfig(): MediaConfig {
  const core = useCore();
  const store = core.media.config;
  const config = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
  return { 'm.upload.size': config.maxUploadSize };
}
