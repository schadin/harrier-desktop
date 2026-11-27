import { describe, expect, it, vi } from 'vitest';
import {
  createMemorySecretStorageKeyStore,
  createSecretStorageCryptoCallbacks,
  createSecretStorageCryptoCallbackBinding,
  createSecretStorageKeyStore,
  type SecretStorageKeyPersistence,
} from './secretStorageKeys';

const encode = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

const createPersistence = () => {
  const entries = new Map<string, string>();
  const persistence: SecretStorageKeyPersistence = {
    load: vi.fn(async () => [...entries.entries()]),
    put: vi.fn(async (keyId: string, value: string) => {
      entries.set(keyId, value);
    }),
    clear: vi.fn(async () => {
      entries.clear();
    }),
  };
  return { persistence, entries };
};

const createLocalStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
};

describe('adapter-owned secret storage key store', () => {
  it('makes generated and decoded keys synchronously visible through the same store', async () => {
    const { persistence, entries } = createPersistence();
    const store = createSecretStorageKeyStore({ persistence });
    const callbacks = createSecretStorageCryptoCallbacks(store);
    const generated = new Uint8Array([1, 2, 3]);
    const decoded = new Uint8Array([4, 5, 6]);

    callbacks.cacheSecretStorageKey('generated', {} as never, generated);
    expect(store.get('generated')).toEqual(generated);
    await store.set('decoded', decoded);
    expect(store.get('decoded')).toEqual(decoded);
    await vi.waitFor(() => {
      expect(entries.get('generated')).toBe(encode(generated));
      expect(entries.get('decoded')).toBe(encode(decoded));
    });
  });

  it('selects a known callback key and returns null when none are cached', async () => {
    const { persistence } = createPersistence();
    const store = createSecretStorageKeyStore({ persistence });
    const callbacks = createSecretStorageCryptoCallbacks(store);
    const privateKey = new Uint8Array([7, 8, 9]);
    await store.set('known', privateKey);

    expect(
      await callbacks.getSecretStorageKey(
        { keys: { missing: {}, known: {} } as never },
        'm.cross_signing.master'
      )
    ).toEqual(['known', privateKey]);
    expect(
      await callbacks.getSecretStorageKey(
        { keys: { missing: {} } as never },
        'm.cross_signing.master'
      )
    ).toBeNull();
  });

  it('clears memory synchronously and awaits persisted cleanup', async () => {
    const { persistence, entries } = createPersistence();
    const store = createSecretStorageKeyStore({ persistence });
    await store.set('key', new Uint8Array([1]));
    expect(entries.has('key')).toBe(true);

    const clearing = store.clear();
    expect(store.get('key')).toBeUndefined();
    await clearing;
    expect(entries.size).toBe(0);
    expect(persistence.clear).toHaveBeenCalledTimes(1);

    await store.clear();
    expect(persistence.clear).toHaveBeenCalledTimes(2);
  });

  it('serializes a pending pre-clear put so it cannot resurrect a logged-out key', async () => {
    const { persistence, entries } = createPersistence();
    let releasePut: (() => void) | undefined;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    persistence.put = vi.fn(async (keyId: string, value: string) => {
      await putGate;
      entries.set(keyId, value);
    });
    const store = createSecretStorageKeyStore({ persistence });

    const setting = store.set('session-key', new Uint8Array([10, 11]));
    await Promise.resolve();
    expect(persistence.put).toHaveBeenCalledTimes(1);
    const clearing = store.clear();
    expect(store.get('session-key')).toBeUndefined();
    releasePut?.();
    await Promise.all([setting, clearing]);

    expect(entries.has('session-key')).toBe(false);
    expect(store.get('session-key')).toBeUndefined();
  });

  it('allows setup to cache a new key after reset clears the previous key', async () => {
    const { persistence, entries } = createPersistence();
    const store = createSecretStorageKeyStore({ persistence });
    await store.set('previous', new Uint8Array([1]));
    await store.clear();

    await store.set('new', new Uint8Array([2]));
    expect(store.get('previous')).toBeUndefined();
    expect(store.get('new')).toEqual(new Uint8Array([2]));
    expect([...entries.keys()]).toEqual(['new']);
  });

  it('keeps persistence failures best effort for memory and logout cleanup', async () => {
    const persistence: SecretStorageKeyPersistence = {
      load: async () => {
        throw new Error('storage unavailable');
      },
      put: async () => {
        throw new Error('storage unavailable');
      },
      clear: async () => {
        throw new Error('storage unavailable');
      },
    };
    const store = createSecretStorageKeyStore({ persistence });

    await expect(store.load()).resolves.toBeUndefined();
    await expect(store.set('key', new Uint8Array([1]))).resolves.toBeUndefined();
    expect(store.get('key')).toEqual(new Uint8Array([1]));
    await expect(store.clear()).resolves.toBeUndefined();
    expect(store.get('key')).toBeUndefined();
  });

  it('prefers IndexedDB keys over localStorage and uses localStorage only for missing ids', async () => {
    const { persistence } = createPersistence();
    const localStorage = createLocalStorage();
    localStorage.setItem('secret-storage-keys.shared', encode(new Uint8Array([1])));
    localStorage.setItem('secret-storage-keys.local-only', encode(new Uint8Array([3])));
    persistence.load = vi.fn(async () => [['shared', encode(new Uint8Array([2]))] as const]);
    const store = createSecretStorageKeyStore({ persistence, localStorage });

    await store.load();

    expect(store.get('shared')).toEqual(new Uint8Array([2]));
    expect(store.get('local-only')).toEqual(new Uint8Array([3]));
  });

  it('does not overwrite a newer synchronous set when an older load completes', async () => {
    let finishLoad: ((entries: readonly (readonly [string, string])[]) => void) | undefined;
    const persistence: SecretStorageKeyPersistence = {
      load: () =>
        new Promise((resolve) => {
          finishLoad = resolve;
        }),
      put: async () => undefined,
      clear: async () => undefined,
    };
    const store = createSecretStorageKeyStore({ persistence });
    const loading = store.load();
    await vi.waitFor(() => expect(finishLoad).toBeTypeOf('function'));

    const setting = store.set('shared', new Uint8Array([3]));
    expect(store.get('shared')).toEqual(new Uint8Array([3]));
    finishLoad?.([['shared', encode(new Uint8Array([2]))]]);
    await Promise.all([loading, setting]);

    expect(store.get('shared')).toEqual(new Uint8Array([3]));
  });

  it('loads valid persisted keys while skipping malformed entries', async () => {
    const persistence: SecretStorageKeyPersistence = {
      load: async () => [
        ['first', encode(new Uint8Array([1, 2]))],
        ['malformed', '%%%'],
        ['last', encode(new Uint8Array([3, 4]))],
      ],
      put: async () => undefined,
      clear: async () => undefined,
    };
    const store = createSecretStorageKeyStore({ persistence });

    await store.load();
    expect(store.get('first')).toEqual(new Uint8Array([1, 2]));
    expect(store.get('malformed')).toBeUndefined();
    expect(store.get('last')).toEqual(new Uint8Array([3, 4]));
  });

  it('loads and clears only namespaced localStorage fallback keys', async () => {
    const { persistence } = createPersistence();
    const localStorage = createLocalStorage();
    const fallbackKey = new Uint8Array([5, 6]);
    localStorage.setItem('secret-storage-keys.default', encode(fallbackKey));
    localStorage.setItem('unrelated.value', 'keep');
    const store = createSecretStorageKeyStore({ persistence, localStorage });

    await store.load();
    expect(store.get('default')).toEqual(fallbackKey);
    await store.clear();

    expect(localStorage.getItem('secret-storage-keys.default')).toBeNull();
    expect(localStorage.getItem('unrelated.value')).toBe('keep');
  });

  it('does not let a new store receive a previous cleared session key', async () => {
    const { persistence, entries } = createPersistence();
    const first = createSecretStorageKeyStore({ persistence });
    await first.set('session-key', new Uint8Array([1, 2, 3]));
    await first.clear();

    const second = createSecretStorageKeyStore({ persistence });
    await second.load();
    expect(second.get('session-key')).toBeUndefined();
    expect(entries.size).toBe(0);
  });

  it('closes a database that succeeds after the open request was already blocked', async () => {
    const db = { close: vi.fn() };
    const request = {} as IDBOpenDBRequest;
    const factory = { open: vi.fn(() => request) };
    const store = createSecretStorageKeyStore({
      indexedDB: factory as unknown as IDBFactory,
      localStorage: null,
    });

    const loading = store.load();
    await vi.waitFor(() => expect(request.onblocked).toBeTypeOf('function'));
    request.onblocked?.(new Event('blocked') as never);
    await expect(loading).resolves.toBeUndefined();

    Object.defineProperty(request, 'result', { value: db, configurable: true });
    request.onsuccess?.(new Event('success') as never);
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('ignores cache callbacks after the client lifecycle revokes them', async () => {
    const store = createMemorySecretStorageKeyStore();
    const binding = createSecretStorageCryptoCallbackBinding(store);
    binding.callbacks.cacheSecretStorageKey('before', {} as never, new Uint8Array([1]));
    expect(store.get('before')).toEqual(new Uint8Array([1]));

    binding.revoke();
    binding.callbacks.cacheSecretStorageKey('late', {} as never, new Uint8Array([2]));

    expect(store.get('late')).toBeUndefined();
    expect(
      await binding.callbacks.getSecretStorageKey(
        { keys: { before: {} } as never },
        'm.cross_signing.master'
      )
    ).toBeNull();
  });
});
