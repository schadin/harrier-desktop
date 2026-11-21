import { useCallback } from 'react';
import { useCore } from './useCore';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnVerification = () => {
  const core = useCore();

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      core.crypto.backup.restore().catch(() => undefined);
    }, [core])
  );
};
