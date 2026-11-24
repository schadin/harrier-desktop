import { ReactNode, useCallback, useEffect } from 'react';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { useAutoDiscoveryInfo } from '../hooks/useAutoDiscoveryInfo';
import {
  AuthFlows,
  RegisterFlowStatus,
  RegisterFlowsResponse,
  parseRegisterErrResp,
} from '../hooks/useAuthFlows';

const authOperations = createAuthOperations();

type AuthFlowsLoaderProps = {
  fallback?: () => ReactNode;
  error?: (err: unknown) => ReactNode;
  children: (authFlows: AuthFlows) => ReactNode;
};
export function AuthFlowsLoader({ fallback, error, children }: AuthFlowsLoaderProps) {
  const autoDiscoveryInfo = useAutoDiscoveryInfo();
  const baseUrl = autoDiscoveryInfo['m.homeserver'].base_url;

  const [state, load] = useAsyncCallback(
    useCallback(async () => {
      const [loginResult, registerResult] = await Promise.allSettled([
        authOperations.loginFlows(baseUrl),
        authOperations.register(baseUrl, {}),
      ]);
      if (loginResult.status === 'rejected') throw loginResult.reason;
      if (!loginResult.value.ok) throw loginResult.value.error;
      let registerFlows: RegisterFlowsResponse = { status: RegisterFlowStatus.InvalidRequest };
      if (
        registerResult.status === 'fulfilled' &&
        registerResult.value.ok &&
        registerResult.value.value.auth
      ) {
        registerFlows = {
          status: RegisterFlowStatus.FlowRequired,
          data: registerResult.value.value.auth,
        };
      } else if (registerResult.status === 'fulfilled' && !registerResult.value.ok) {
        registerFlows = parseRegisterErrResp(registerResult.value.error);
      }
      return { loginFlows: loginResult.value.value, registerFlows };
    }, [baseUrl])
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === AsyncStatus.Idle || state.status === AsyncStatus.Loading) {
    return fallback?.();
  }
  if (state.status === AsyncStatus.Error) {
    return error?.(state.error);
  }
  return children(state.data);
}
