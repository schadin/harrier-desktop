import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { ClientEvent } from 'matrix-js-sdk';
import { backupRestoreProgressAtom, BackupProgressStatus } from '../state/backupRestore';
import { useMatrixClient } from './useMatrixClient';
import { useKeyBackupDecryptionKeyCached } from './useKeyBackup';

export const useRestoreBackupOnStartup = () => {
  const mx = useMatrixClient();
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);
  const restoreProgress = useAtomValue(backupRestoreProgressAtom);
  const restoringRef = useRef(false);
  const attemptedRef = useRef(false);
  const progressStatusRef = useRef(restoreProgress.status);

  useEffect(() => {
    progressStatusRef.current = restoreProgress.status;
  }, [restoreProgress.status]);

  const restoreBackup = useCallback(async () => {
    if (restoringRef.current || attemptedRef.current) return;
    const crypto = mx.getCrypto();
    if (!crypto) return;

    const progressStatus = progressStatusRef.current;
    if (
      progressStatus === BackupProgressStatus.Fetching ||
      progressStatus === BackupProgressStatus.Loading ||
      progressStatus === BackupProgressStatus.Done
    ) {
      return;
    }

    restoringRef.current = true;
    attemptedRef.current = true;
    try {
      await crypto.bootstrapSecretStorage({});
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.restoreKeyBackup({
        progressCallback(progress) {
          setRestoreProgress(progress);
        },
      });
    } catch {
      // restoring backup is best-effort; failures are non-fatal
    } finally {
      restoringRef.current = false;
    }
  }, [mx, setRestoreProgress]);

  useKeyBackupDecryptionKeyCached(
    useCallback(() => {
      // ключ бэкапа появился — разрешаем одну новую попытку
      attemptedRef.current = false;
      restoreBackup();
    }, [restoreBackup])
  );

  useEffect(() => {
    const handleSync: (state: string) => void = (state) => {
      if (state !== 'SYNCING') return;
      restoreBackup();
    };

    mx.on(ClientEvent.Sync, handleSync);
    handleSync(mx.getSyncState() ?? '');

    return () => {
      mx.removeListener(ClientEvent.Sync, handleSync);
    };
  }, [mx, restoreBackup]);
};
