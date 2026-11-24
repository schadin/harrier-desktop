import { useCallback } from 'react';
import { AsyncStatus, useAsyncCallbackValue } from './useAsyncCallback';
import { useCore } from './useCore';

type RefreshHandler = () => void;

type EmailNotificationResult = {
  enabled: boolean;
  email?: string;
};

export const useEmailNotifications = (): [
  EmailNotificationResult | undefined | null,
  RefreshHandler
] => {
  const core = useCore();

  const [emailState, refresh] = useAsyncCallbackValue<EmailNotificationResult, Error>(
    useCallback(async () => {
      const result = await core.notifications.emailNotifications();
      if (!result.ok) throw result.error;
      return result.value;
    }, [core])
  );

  if (emailState.status === AsyncStatus.Success) {
    return [emailState.data, refresh];
  }

  if (emailState.status === AsyncStatus.Error) {
    return [null, refresh];
  }

  return [undefined, refresh];
};
