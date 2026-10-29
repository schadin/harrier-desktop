import { useCallback, useEffect, useRef } from 'react';
import { ClientEvent } from 'matrix-js-sdk';
import { CryptoEvent, CryptoEventHandlerMap } from 'matrix-js-sdk/lib/crypto-api';
import { useMatrixClient } from './useMatrixClient';
import { useDebounce } from './useDebounce';
import { retryFailedTimelineEvents } from '../utils/room';

export const useRetryDecryptionOnKeyArrival = () => {
  const mx = useMatrixClient();
  const runningRef = useRef(false);

  const retry = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await retryFailedTimelineEvents(mx);
    } finally {
      runningRef.current = false;
    }
  }, [mx]);

  const debouncedRetry = useDebounce(
    () => {
      retry();
    },
    { wait: 500 }
  );

  const onKeyBackupSessionsRemaining: CryptoEventHandlerMap[CryptoEvent.KeyBackupSessionsRemaining] =
    useCallback(
      (count) => {
        if (count === 0) debouncedRetry();
      },
      [debouncedRetry]
    );

  const onKeyBackupDecryptionKeyCached: CryptoEventHandlerMap[CryptoEvent.KeyBackupDecryptionKeyCached] =
    useCallback(() => {
      debouncedRetry();
    }, [debouncedRetry]);

  const onDevicesUpdated: CryptoEventHandlerMap[CryptoEvent.DevicesUpdated] = useCallback(() => {
    debouncedRetry();
  }, [debouncedRetry]);

  const onUserTrustStatusChanged: CryptoEventHandlerMap[CryptoEvent.UserTrustStatusChanged] =
    useCallback(() => {
      debouncedRetry();
    }, [debouncedRetry]);

  useEffect(() => {
    mx.on(CryptoEvent.KeyBackupSessionsRemaining, onKeyBackupSessionsRemaining);
    mx.on(CryptoEvent.KeyBackupDecryptionKeyCached, onKeyBackupDecryptionKeyCached);
    mx.on(CryptoEvent.DevicesUpdated, onDevicesUpdated);
    mx.on(CryptoEvent.UserTrustStatusChanged, onUserTrustStatusChanged);
    return () => {
      mx.removeListener(CryptoEvent.KeyBackupSessionsRemaining, onKeyBackupSessionsRemaining);
      mx.removeListener(CryptoEvent.KeyBackupDecryptionKeyCached, onKeyBackupDecryptionKeyCached);
      mx.removeListener(CryptoEvent.DevicesUpdated, onDevicesUpdated);
      mx.removeListener(CryptoEvent.UserTrustStatusChanged, onUserTrustStatusChanged);
    };
  }, [
    mx,
    onKeyBackupSessionsRemaining,
    onKeyBackupDecryptionKeyCached,
    onDevicesUpdated,
    onUserTrustStatusChanged,
  ]);

  useEffect(() => {
    const handleSync: (state: string) => void = (state) => {
      if (state !== 'SYNCING') return;
      retry();
    };

    mx.on(ClientEvent.Sync, handleSync);
    handleSync(mx.getSyncState() ?? '');

    return () => {
      mx.removeListener(ClientEvent.Sync, handleSync);
    };
  }, [mx, retry]);
};
