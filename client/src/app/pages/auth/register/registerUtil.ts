import type { JsonObject, RegisterResponseView } from '@harrier/core';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginPathSearchParams } from '../../paths';
import {
  deleteAfterLoginRedirectPath,
  getAfterLoginRedirectPath,
} from '../../afterLoginRedirectPath';
import { getHomePath, getLoginPath, withSearchParam } from '../../pathUtils';
import { getMxIdLocalPart, getMxIdServer } from '../../../utils/matrix';
import { setFallbackSession } from '../../../state/sessions';

export enum RegisterError {
  UserTaken = 'UserTaken',
  UserInvalid = 'UserInvalid',
  UserExclusive = 'UserExclusive',
  PasswordWeak = 'PasswordWeak',
  PasswordShort = 'PasswordShort',
  InvalidRequest = 'InvalidRequest',
  Forbidden = 'Forbidden',
  RateLimited = 'RateLimited',
  Unknown = 'Unknown',
}

export type CustomRegisterResponse = {
  baseUrl: string;
  response: RegisterResponseView;
};
export type RegisterResult = [JsonObject, undefined] | [undefined, CustomRegisterResponse];

const authOperations = createAuthOperations();

export const register = async (
  baseUrl: string,
  requestData: { type?: string; [key: string]: unknown }
): Promise<RegisterResult> => {
  const result = await authOperations.register(baseUrl, requestData);
  if (!result.ok) throw result.error;
  if (result.value.auth) return [result.value.auth, undefined];
  if (!result.value.response) throw new Error('Missing registration response');
  return [undefined, { baseUrl, response: result.value.response }];
};

export const useRegisterComplete = (data?: CustomRegisterResponse) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (data) {
      const { response, baseUrl } = data;

      const { userId, accessToken, deviceId } = response;

      if (accessToken && deviceId) {
        setFallbackSession(accessToken, deviceId, userId, baseUrl);
        const afterLoginRedirectPath = getAfterLoginRedirectPath();
        deleteAfterLoginRedirectPath();
        navigate(afterLoginRedirectPath ?? getHomePath(), { replace: true });
      } else {
        const username = getMxIdLocalPart(userId);
        const userServer = getMxIdServer(userId);
        navigate(
          withSearchParam<LoginPathSearchParams>(getLoginPath(userServer), {
            username,
          }),
          { replace: true }
        );
      }
    }
  }, [data, navigate]);
};
