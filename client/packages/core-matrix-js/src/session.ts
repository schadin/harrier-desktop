import { createClient, IndexedDBCryptoStore, IndexedDBStore, MatrixClient } from 'matrix-js-sdk';
import {
  associateMatrixJsClientSecretStorage,
  createSecretStorageCryptoCallbackBinding,
  createSecretStorageKeyStore,
  type LoadableSecretStorageKeyStore,
  type SecretStorageKeyStore,
} from './secretStorageKeys';

export type MatrixJsSession = {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly userId: string;
  readonly deviceId: string;
};

export type MatrixJsClientOptions = {
  readonly secretStorageKeys?: SecretStorageKeyStore;
};

/**
 * Legacy bridge while MatrixClientProvider is being removed.
 * New consumers must use createMatrixJsCore instead of receiving this client.
 */
export async function createMatrixJsClient(
  session: MatrixJsSession,
  options: MatrixJsClientOptions = {}
): Promise<MatrixClient> {
  let secretStorageKeys: SecretStorageKeyStore;
  if (options.secretStorageKeys) {
    secretStorageKeys = options.secretStorageKeys;
  } else {
    const persistentStore: LoadableSecretStorageKeyStore = createSecretStorageKeyStore();
    await persistentStore.load();
    secretStorageKeys = persistentStore;
  }
  const callbackBinding = createSecretStorageCryptoCallbackBinding(secretStorageKeys);

  const indexedDBStore = new IndexedDBStore({
    indexedDB: globalThis.indexedDB,
    localStorage: globalThis.localStorage,
    dbName: 'web-sync-store',
  });
  const legacyCryptoStore = new IndexedDBCryptoStore(globalThis.indexedDB, 'crypto-store');

  const client = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: callbackBinding.callbacks,
    verificationMethods: ['m.sas.v1'],
  });

  associateMatrixJsClientSecretStorage(client, secretStorageKeys, callbackBinding.revoke);

  await indexedDBStore.startup();
  await client.initRustCrypto();
  client.setMaxListeners(50);
  return client;
}
