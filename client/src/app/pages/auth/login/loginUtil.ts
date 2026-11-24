import { CoreError, type LoginResponseView } from '@harrier/core';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientConfig, clientAllowedServer } from '../../../hooks/useClientConfig';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '../../afterLoginRedirectPath';
import { getHomePath } from '../../pathUtils';
import { setFallbackSession } from '../../../state/sessions';

export enum GetBaseUrlError {
  NotAllow = 'NotAllow',
  NotFound = 'NotFound',
}

const authOperations = createAuthOperations();

export const factoryGetBaseUrl = (clientConfig: ClientConfig, server: string) => {
  const getBaseUrl = async (): Promise<string> => {
    if (!clientAllowedServer(clientConfig, server)) {
      throw new Error(GetBaseUrlError.NotAllow);
    }

    const discovery = await authOperations.discover(server);
    if (!discovery.ok || !discovery.value) {
      throw new Error(GetBaseUrlError.NotFound);
    }
    return discovery.value['m.homeserver'].base_url;
  };
  return getBaseUrl;
};

export enum LoginError {
  ServerNotAllowed = 'ServerNotAllowed',
  InvalidServer = 'InvalidServer',
  Forbidden = 'Forbidden',
  UserDeactivated = 'UserDeactivated',
  InvalidRequest = 'InvalidRequest',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomLoginResponse = {
  baseUrl: string;
  response: LoginResponseView;
};
export const login = async (
  serverBaseUrl: string | (() => Promise<string>),
  data: { type: string; [key: string]: unknown }
): Promise<CustomLoginResponse> => {
  let url: string;
  try {
    url = typeof serverBaseUrl === 'function' ? await serverBaseUrl() : serverBaseUrl;
  } catch (error) {
    const errcode =
      error instanceof Error && error.message === GetBaseUrlError.NotAllow
        ? LoginError.ServerNotAllowed
        : LoginError.InvalidServer;
    throw new CoreError('unknown', errcode, false, undefined, errcode);
  }

  const result = await authOperations.login(url, data);
  if (!result.ok) throw result.error;
  return { baseUrl: url, response: result.value };
};

export const useLoginComplete = (data?: CustomLoginResponse) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (data) {
      const { response: loginRes, baseUrl: loginBaseUrl } = data;
      setFallbackSession(loginRes.accessToken, loginRes.deviceId, loginRes.userId, loginBaseUrl);
      const afterLoginRedirectUrl = getAfterLoginRedirectPath();
      deleteAfterLoginRedirectPath();
      navigate(afterLoginRedirectUrl ?? getHomePath(), { replace: true });
    }
  }, [data, navigate]);
};
