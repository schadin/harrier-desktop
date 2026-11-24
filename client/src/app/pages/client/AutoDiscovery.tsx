import React, { ReactNode, useCallback, useMemo } from 'react';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { AutoDiscoveryInfoProvider } from '../../hooks/useAutoDiscoveryInfo';
import { AsyncStatus, useAsyncCallbackValue } from '../../hooks/useAsyncCallback';
import { AutoDiscoveryInfo } from '../../cs-api';
import { getMxIdServer } from '../../utils/matrix';

const authOperations = createAuthOperations();

type AutoDiscoveryProps = {
  userId: string;
  baseUrl: string;
  children: ReactNode;
};
export function AutoDiscovery({ userId, baseUrl, children }: AutoDiscoveryProps) {
  const [state] = useAsyncCallbackValue(
    useCallback(async () => {
      const server = getMxIdServer(userId);
      const result = await authOperations.discover(server ?? userId);
      return result.ok ? result.value : undefined;
    }, [userId])
  );

  const info = state.status === AsyncStatus.Success ? state.data : undefined;

  const fallback: AutoDiscoveryInfo = useMemo(
    () => ({
      'm.homeserver': {
        base_url: baseUrl,
      },
    }),
    [baseUrl]
  );

  return <AutoDiscoveryInfoProvider value={info ?? fallback}>{children}</AutoDiscoveryInfoProvider>;
}
