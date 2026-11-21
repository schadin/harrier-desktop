import { useCallback, useRef } from 'react';
import { useCore } from './useCore';
import { useDebounce } from './useDebounce';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRetryDecryptionOnKeyArrival = () => {
  const core = useCore();
  const runningRef = useRef(false);

  const retry = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await core.crypto.backup.retryDecryption();
    } finally {
      runningRef.current = false;
    }
  }, [core]);

  const debouncedRetry = useDebounce(
    () => {
      retry();
    },
    { wait: 500 }
  );

  useKeyBackupDecryptionKeyCached(debouncedRetry);
};
