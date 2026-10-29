const secretStorageKeys = new Map();

const DB_NAME = 'secret-storage-keys';
const STORE_NAME = 'keys';

const toBase64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

function openDb() {
  return new Promise((resolve, reject) => {
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
}

async function persistKey(keyId, privateKey) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(toBase64(privateKey), keyId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Persisting is best-effort; in-memory map still works.
  }
}

async function clearPersistedKeys() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function loadSecretStorageKeys() {
  try {
    const db = await openDb();
    const keys = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAllKeys();
      const valuesRequest = tx.objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      valuesRequest.onerror = () => reject(valuesRequest.error);
      tx.oncomplete = () => resolve({ keys: request.result, values: valuesRequest.result });
    });
    db.close();
    keys.keys.forEach((keyId, index) => {
      const privateKey = fromBase64(keys.values[index]);
      if (privateKey instanceof Uint8Array) {
        secretStorageKeys.set(keyId, privateKey);
      }
    });
  } catch {
    // ignore
  }
}

export function storePrivateKey(keyId, privateKey) {
  if (privateKey instanceof Uint8Array === false) {
    throw new Error('Unable to store, privateKey is invalid.');
  }
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey);
}

function hasPrivateKey(keyId) {
  return secretStorageKeys.get(keyId) instanceof Uint8Array;
}

function getPrivateKey(keyId) {
  return secretStorageKeys.get(keyId);
}

export function clearSecretStorageKeys() {
  secretStorageKeys.clear();
  clearPersistedKeys();
}

async function getSecretStorageKey({ keys }) {
  const keyIds = Object.keys(keys);
  const keyId = keyIds.find(hasPrivateKey);
  if (!keyId) return undefined;
  const privateKey = getPrivateKey(keyId);
  return [keyId, privateKey];
}

function cacheSecretStorageKey(keyId, keyInfo, privateKey) {
  secretStorageKeys.set(keyId, privateKey);
  persistKey(keyId, privateKey);
}

export const cryptoCallbacks = {
  getSecretStorageKey,
  cacheSecretStorageKey,
};
