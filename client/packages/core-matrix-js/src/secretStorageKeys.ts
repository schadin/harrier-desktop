import type { HarrierCore } from '@harrier/core';
import type { MatrixClient } from 'matrix-js-sdk';
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';

const DB_NAME = 'secret-storage-keys';
const STORE_NAME = 'keys';
const LOCAL_STORAGE_PREFIX = `${DB_NAME}.`;

export type SecretStorageKeyStore = {
  get(keyId: string): Uint8Array | undefined;
  set(keyId: string, privateKey: Uint8Array): Promise<void>;
  clear(): Promise<void>;
};

export type LoadableSecretStorageKeyStore = SecretStorageKeyStore & {
  load(): Promise<void>;
};

export type SecretStorageKeyPersistence = {
  load(): Promise<readonly (readonly [string, string])[]>;
  put(keyId: string, encodedPrivateKey: string): Promise<void>;
  clear(): Promise<void>;
};

export type SecretStorageKeyStoreOptions = {
  readonly persistence?: SecretStorageKeyPersistence;
  readonly indexedDB?: IDBFactory | null;
  readonly localStorage?: Storage | null;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array | undefined => {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
};

const globalIndexedDB = (): IDBFactory | undefined => {
  try {
    return globalThis.indexedDB;
  } catch {
    return undefined;
  }
};

const globalLocalStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const openDb = (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME);
    let settled = false;
    const rejectOnce = (error: DOMException | null) => {
      if (settled) return;
      settled = true;
      reject(error ?? new Error('Secret storage database blocked'));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db?.close();
        return;
      }
      settled = true;
      resolve(db);
    };
    request.onerror = () => rejectOnce(request.error);
    request.onblocked = () => rejectOnce(request.error);
  });

const createIndexedDBPersistence = (factory?: IDBFactory): SecretStorageKeyPersistence => {
  const unavailable: SecretStorageKeyPersistence = {
    load: async () => [],
    put: async () => undefined,
    clear: async () => undefined,
  };
  if (!factory) return unavailable;

  const withStore = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> => {
    const db = await openDb(factory);
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.catch(() => undefined);
        transaction.oncomplete = () => {
          request.then(resolve, reject);
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  };

  return {
    async load() {
      return withStore('readonly', async (store) => {
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        const [keys, values] = await Promise.all([
          new Promise<IDBValidKey[]>((resolve, reject) => {
            keysRequest.onsuccess = () => resolve(keysRequest.result);
            keysRequest.onerror = () => reject(keysRequest.error);
          }),
          new Promise<unknown[]>((resolve, reject) => {
            valuesRequest.onsuccess = () => resolve(valuesRequest.result);
            valuesRequest.onerror = () => reject(valuesRequest.error);
          }),
        ]);
        return keys.flatMap((keyId, index) => {
          const value = values[index];
          return typeof keyId === 'string' && typeof value === 'string'
            ? [[keyId, value] as const]
            : [];
        });
      });
    },
    async put(keyId, encodedPrivateKey) {
      await withStore('readwrite', async (store) => {
        await new Promise<void>((resolve, reject) => {
          const request = store.put(encodedPrivateKey, keyId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },
    async clear() {
      await withStore('readwrite', async (store) => {
        await new Promise<void>((resolve, reject) => {
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      });
    },
  };
};

export function createSecretStorageKeyStore(
  options: SecretStorageKeyStoreOptions = {}
): LoadableSecretStorageKeyStore {
  const persistence =
    options.persistence ??
    createIndexedDBPersistence(
      options.indexedDB === undefined ? globalIndexedDB() : options.indexedDB ?? undefined
    );
  const localStorage =
    options.localStorage === undefined ? globalLocalStorage() : options.localStorage ?? undefined;
  const keys = new Map<string, Uint8Array>();
  let generation = 0;
  let persistenceQueue: Promise<void> = Promise.resolve();
  let allowLocalStorageFallback = true;
  let pendingLoads = 0;

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = persistenceQueue.then(operation).catch(() => undefined);
    persistenceQueue = result;
    return result;
  };

  const readLocalStorageKey = (keyId: string): Uint8Array | undefined => {
    if (!allowLocalStorageFallback || pendingLoads > 0 || !localStorage) return undefined;
    try {
      const stored = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${keyId}`);
      return stored === null ? undefined : fromBase64(stored);
    } catch {
      return undefined;
    }
  };

  const cache = (keyId: string, privateKey: Uint8Array) => {
    keys.set(keyId, privateKey);
  };

  const loadLocalStorageKeys = (persistedKeyIds: ReadonlySet<string>) => {
    const storage = localStorage;
    if (!allowLocalStorageFallback || !storage) return;
    try {
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((storageKey): storageKey is string =>
          Boolean(storageKey?.startsWith(LOCAL_STORAGE_PREFIX))
        )
        .forEach((storageKey) => {
          const keyId = storageKey.slice(LOCAL_STORAGE_PREFIX.length);
          if (persistedKeyIds.has(keyId) || keys.has(keyId)) return;
          const stored = storage.getItem(storageKey);
          if (stored === null) return;
          const privateKey = fromBase64(stored);
          if (privateKey) cache(keyId, privateKey);
        });
    } catch {
      // Local storage compatibility reads are best-effort.
    }
  };

  const clearLocalStorageKeys = () => {
    const storage = localStorage;
    if (!storage) return;
    try {
      Array.from({ length: storage.length }, (_, index) => storage.key(index)).forEach(
        (storageKey) => {
          if (storageKey?.startsWith(LOCAL_STORAGE_PREFIX)) storage.removeItem(storageKey);
        }
      );
    } catch {
      // Persisted cleanup is best-effort; memory is already cleared.
    }
  };

  return {
    get(keyId) {
      const privateKey = keys.get(keyId) ?? readLocalStorageKey(keyId);
      if (privateKey) cache(keyId, privateKey);
      return privateKey;
    },
    set(keyId, privateKey) {
      if (!(privateKey instanceof Uint8Array)) {
        throw new Error('Unable to store, privateKey is invalid.');
      }
      cache(keyId, privateKey);
      const setGeneration = generation;
      return enqueue(async () => {
        if (setGeneration !== generation) return;
        await persistence.put(keyId, toBase64(privateKey));
      });
    },
    async load() {
      const loadGeneration = generation;
      pendingLoads += 1;
      try {
        await enqueue(async () => {
          if (loadGeneration !== generation) return;
          const entries = await persistence.load().catch(() => []);
          if (loadGeneration !== generation) return;
          const persistedKeyIds = new Set<string>();
          entries.forEach(([keyId, encodedPrivateKey]) => {
            if (typeof keyId !== 'string') return;
            persistedKeyIds.add(keyId);
            if (keys.has(keyId)) return;
            const privateKey = fromBase64(encodedPrivateKey);
            if (privateKey) cache(keyId, privateKey);
          });
          loadLocalStorageKeys(persistedKeyIds);
        });
      } finally {
        pendingLoads -= 1;
      }
    },
    clear() {
      generation += 1;
      allowLocalStorageFallback = false;
      keys.clear();
      clearLocalStorageKeys();
      const clearGeneration = generation;
      return enqueue(async () => {
        if (clearGeneration === generation) await persistence.clear();
      });
    },
  };
}

export function createMemorySecretStorageKeyStore(): SecretStorageKeyStore {
  return createSecretStorageKeyStore({
    persistence: {
      load: async () => [],
      put: async () => undefined,
      clear: async () => undefined,
    },
    localStorage: null,
  });
}

type RequiredCryptoCallbacks = Required<CryptoCallbacks>;

const createCallbacks = (
  store: SecretStorageKeyStore,
  isActive: () => boolean
): RequiredCryptoCallbacks => ({
  async getSecretStorageKey({ keys }) {
    if (!isActive()) return null;
    const keyId = Object.keys(keys).find((candidate) => store.get(candidate) !== undefined);
    if (keyId === undefined) return null;
    const privateKey = store.get(keyId);
    return privateKey === undefined ? null : [keyId, privateKey];
  },
  cacheSecretStorageKey(keyId, _keyInfo, privateKey) {
    if (!isActive()) return;
    store.set(keyId, privateKey).catch(() => undefined);
  },
});

export function createSecretStorageCryptoCallbacks(
  store: SecretStorageKeyStore
): RequiredCryptoCallbacks {
  return createCallbacks(store, () => true);
}

export function createSecretStorageCryptoCallbackBinding(store: SecretStorageKeyStore): {
  callbacks: RequiredCryptoCallbacks;
  revoke(): void;
} {
  let active = true;
  return {
    callbacks: createCallbacks(store, () => active),
    revoke() {
      active = false;
    },
  };
}

type ClientSecretStorageAssociation = {
  readonly store: SecretStorageKeyStore;
  readonly revokeCallbacks: () => void;
};

type CoreSecretStorageAssociation = {
  readonly store: SecretStorageKeyStore;
  readonly reset: () => void;
};

const clientSecretStorage = new WeakMap<MatrixClient, ClientSecretStorageAssociation>();
const coreSecretStorage = new WeakMap<HarrierCore, CoreSecretStorageAssociation>();

export function associateMatrixJsClientSecretStorage(
  client: MatrixClient,
  store: SecretStorageKeyStore,
  revokeCallbacks: () => void
): void {
  clientSecretStorage.set(client, { store, revokeCallbacks });
}

export function resolveMatrixJsSecretStorage(
  client: MatrixClient,
  override?: SecretStorageKeyStore
): SecretStorageKeyStore {
  const associated = clientSecretStorage.get(client);
  if (associated && override && override !== associated.store) {
    throw new Error('Secret storage key store does not match the Matrix client.');
  }
  return override ?? associated?.store ?? createMemorySecretStorageKeyStore();
}

export function revokeMatrixJsSecretStorageCallbacks(client: MatrixClient): void {
  clientSecretStorage.get(client)?.revokeCallbacks();
}

export function associateMatrixJsCoreSecretStorage(
  core: HarrierCore,
  store: SecretStorageKeyStore,
  reset: () => void
): void {
  coreSecretStorage.set(core, { store, reset });
}

export function clearSecretStorageKeysForCore(core: HarrierCore): Promise<void> {
  const association = coreSecretStorage.get(core);
  if (!association) throw new Error('Matrix core has no adapter-owned secret storage key store.');
  association.reset();
  return association.store.clear();
}
