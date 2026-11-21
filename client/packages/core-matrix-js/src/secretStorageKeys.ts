const secretStorageKeys = new Map<string, Uint8Array>();

const DB_NAME = 'secret-storage-keys';
const STORE_NAME = 'keys';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const persistKey = async (keyId: string, privateKey: Uint8Array): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(toBase64(privateKey), keyId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Persisting is best-effort; in-memory map still works.
  }
};

const getPrivateKey = (keyId: string): Uint8Array | undefined => {
  const key = secretStorageKeys.get(keyId);
  if (key instanceof Uint8Array) return key;
  const stored = localStorage.getItem(`${DB_NAME}.${keyId}`);
  if (stored) {
    try {
      const binary = atob(stored);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      secretStorageKeys.set(keyId, bytes);
      return bytes;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export function storeSecretStorageKey(keyId: string, privateKey: Uint8Array): void {
  if (!(privateKey instanceof Uint8Array)) {
    throw new Error('Unable to store, privateKey is invalid.');
  }
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey).catch(() => undefined);
}

export function clearSecretStorageKeys(): void {
  secretStorageKeys.clear();
  try {
    localStorage.removeItem(`${DB_NAME}.default`);
  } catch {
    // ignore
  }
}

export function hasSecretStorageKey(keyId: string): boolean {
  return getPrivateKey(keyId) instanceof Uint8Array;
}
