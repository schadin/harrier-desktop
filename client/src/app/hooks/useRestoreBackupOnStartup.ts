import { useCallback, useEffect, useRef } from 'react';
import { useCore } from './useCore';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnStartup = () => {
  const core = useCore();
  const restoringRef = useRef(false);
  const attemptedRef = useRef(false);

  const restoreBackup = useCallback(async () => {
    if (restoringRef.current || attemptedRef.current) return;
    restoringRef.current = true;
    attemptedRef.current = true;
    try {
      await core.crypto.backup.prepareAndRestore();
    } catch {
      // restoring backup is best-effort; failures are non-fatal
    } finally {
      restoringRef.current = false;
    }
  }, [core]);

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      attemptedRef.current = false;
      restoreBackup();
    }, [restoreBackup])
  );

  useEffect(() => {
    restoreBackup();
  }, [restoreBackup]);
};
