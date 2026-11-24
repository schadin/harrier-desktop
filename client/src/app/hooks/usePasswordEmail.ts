import type { CoreError } from '@harrier/core';
import { createAuthOperations } from '@harrier/core-matrix-js';
import { useCallback, useRef } from 'react';
import { AsyncState, useAsyncCallback } from './useAsyncCallback';
import { RequestEmailTokenCallback, RequestEmailTokenResponse } from './types';

const authOperations = createAuthOperations();

export const usePasswordEmail = (
  baseUrl: string
): [AsyncState<RequestEmailTokenResponse, CoreError>, RequestEmailTokenCallback] => {
  const sendAttemptRef = useRef(1);
  const passwordEmailCallback: RequestEmailTokenCallback = useCallback(
    async (email, clientSecret, nextLink) => {
      const sendAttempt = sendAttemptRef.current;
      sendAttemptRef.current += 1;
      const result = await authOperations.requestEmailToken(
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

  const [passwordEmailState, passwordEmail] = useAsyncCallback<
    RequestEmailTokenResponse,
    CoreError,
    Parameters<RequestEmailTokenCallback>
  >(passwordEmailCallback);

  return [passwordEmailState, passwordEmail];
};
