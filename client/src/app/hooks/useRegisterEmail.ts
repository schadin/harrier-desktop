import type { CoreError } from '@harrier/core';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { useCallback, useRef } from 'react';
import { AsyncState, useAsyncCallback } from './useAsyncCallback';
import { RequestEmailTokenCallback, RequestEmailTokenResponse } from './types';

const authOperations = createAuthOperations();

export const useRegisterEmail = (
  baseUrl: string
): [AsyncState<RequestEmailTokenResponse, CoreError>, RequestEmailTokenCallback] => {
  const sendAttemptRef = useRef(1);
  const registerEmailCallback: RequestEmailTokenCallback = useCallback(
    async (email, clientSecret, nextLink) => {
      const sendAttempt = sendAttemptRef.current;
      sendAttemptRef.current += 1;
      const result = await authOperations.requestRegisterEmailToken(
        baseUrl,
        email,
        clientSecret,
        sendAttempt,
        nextLink
      );
      if (!result.ok) throw result.error;
      return { email, clientSecret, result: result.value };
    },
    [baseUrl]
  );

  const [registerEmailState, registerEmail] = useAsyncCallback<
    RequestEmailTokenResponse,
    CoreError,
    Parameters<RequestEmailTokenCallback>
  >(registerEmailCallback);

  return [registerEmailState, registerEmail];
};
