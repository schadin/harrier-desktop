import { useMemo } from 'react';
import { useAccountData } from './useAccountData';
import { AccountDataEvent } from '../../types/matrix/accountData';

export type IgnoredUserListContent = {
  ignored_users?: Record<string, object>;
};

export const useIgnoredUsers = (): string[] => {
  const ignoredUserListEvt = useAccountData(AccountDataEvent.IgnoredUserList);
  const ignoredUsers = useMemo(() => {
    const ignoredUsersRecord =
      (ignoredUserListEvt as IgnoredUserListContent | null)?.ignored_users ?? {};
    return Object.keys(ignoredUsersRecord);
  }, [ignoredUserListEvt]);

  return ignoredUsers;
};
