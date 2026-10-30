import { useMemo } from 'react';
import { useUserPresence } from './useUserPresence';
import { CustomStatus, parseStatusMsg } from '../plugins/custom-status';

export const useCustomStatus = (userId: string): CustomStatus | undefined => {
  const presence = useUserPresence(userId);

  return useMemo(() => {
    if (!presence || presence.status === undefined) return undefined;
    const status = parseStatusMsg(presence.status);
    if (!status.emoji && !status.text) return undefined;
    return status;
  }, [presence]);
};
