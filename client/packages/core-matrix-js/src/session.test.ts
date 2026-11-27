import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type MatrixClient } from 'matrix-js-sdk';
import { createMatrixJsClient, type MatrixJsSession } from './session';
import { createMatrixJsCore } from './core';
import {
  clearSecretStorageKeysForCore,
  createMemorySecretStorageKeyStore,
} from './secretStorageKeys';

const sdkState = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('matrix-js-sdk')>();
  const { MemoryStore } = await import('matrix-js-sdk/lib/store/memory');
  class FakeIndexedDBStore extends MemoryStore {
    // eslint-disable-next-line class-methods-use-this
    startup = async () => {
      sdkState.events.push('store.startup');
    };
  }
  return {
    ...actual,
    IndexedDBStore: FakeIndexedDBStore,
    IndexedDBCryptoStore: vi.fn(),
    createClient: vi.fn((options: Parameters<typeof actual.createClient>[0]) => {
      sdkState.events.push('sdk.createClient');
      const client = actual.createClient(options);
      client.initRustCrypto = async () => {
        sdkState.events.push('crypto.initRustCrypto');
      };
      return client;
    }),
  };
});

const SESSION: MatrixJsSession = {
  baseUrl: 'https://matrix.example.org',
  accessToken: 'test-token',
  userId: '@tester:example.org',
  deviceId: 'DEVICE1',
};

const encode = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

const installIndexedDB = (entries: readonly (readonly [string, string])[]) => {
  const persisted = new Map(entries);
  const request = <T>(result: T): IDBRequest<T> => {
    const pending = {} as IDBRequest<T>;
    queueMicrotask(() => {
      Object.defineProperty(pending, 'result', { value: result, configurable: true });
      pending.onsuccess?.(new Event('success') as never);
    });
    return pending;
  };
  const store = {
    getAllKeys: vi.fn(() => {
      sdkState.events.push('idb.getAllKeys');
      return request([...persisted.keys()]);
    }),
    getAll: vi.fn(() => {
      sdkState.events.push('idb.getAll');
      return request([...persisted.values()]);
    }),
    put: vi.fn((value: string, keyId: string) => {
      persisted.set(keyId, value);
      return request('key');
    }),
    clear: vi.fn(() => {
      persisted.clear();
      return request(undefined);
    }),
  };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn(() => {
      const transaction = {} as IDBTransaction;
      Object.defineProperty(transaction, 'objectStore', { value: () => store });
      queueMicrotask(() => {
        transaction.oncomplete?.(new Event('complete') as never);
      });
      return transaction;
    }),
  };
  const openRequest = {} as IDBOpenDBRequest;
  const factory = {
    open: vi.fn(() => {
      sdkState.events.push('idb.open');
      queueMicrotask(() => {
        Object.defineProperty(openRequest, 'result', { value: db, configurable: true });
        openRequest.onsuccess?.(new Event('success') as never);
      });
      return openRequest;
    }),
  };
  vi.stubGlobal('indexedDB', factory as unknown as IDBFactory);
  vi.stubGlobal('localStorage', {
    length: 0,
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  } satisfies Storage);
  return { persisted };
};

const prepareForCore = (client: MatrixClient) => {
  Object.assign(client, {
    getCrypto: () => undefined,
    getVersions: async () => ({ versions: ['v1.11'], unstable_features: {} }),
    getMediaConfig: async () => ({}),
    getCapabilities: async () => ({}),
    getAuthMetadata: async () => undefined,
  });
};

const clientCallbacks = (
  callIndex = 0
): NonNullable<NonNullable<Parameters<typeof createClient>[0]>['cryptoCallbacks']> => {
  const options = vi.mocked(createClient).mock.calls[callIndex]?.[0];
  if (!options?.cryptoCallbacks) throw new Error('Adapter crypto callbacks were not provided');
  return options.cryptoCallbacks;
};

describe('Matrix client secret-storage association', () => {
  beforeEach(() => {
    sdkState.events.length = 0;
    vi.mocked(createClient).mockClear();
    vi.unstubAllGlobals();
  });

  it('loads the default store before SDK client creation and shares it with core cleanup', async () => {
    const privateKey = new Uint8Array([1, 2, 3]);
    const { persisted } = installIndexedDB([['persisted', encode(privateKey)]]);

    const client = await createMatrixJsClient(SESSION);
    expect(sdkState.events.indexOf('idb.getAll')).toBeLessThan(
      sdkState.events.indexOf('sdk.createClient')
    );
    expect(sdkState.events.indexOf('sdk.createClient')).toBeLessThan(
      sdkState.events.indexOf('crypto.initRustCrypto')
    );

    const callbacks = clientCallbacks();
    expect(
      await callbacks.getSecretStorageKey?.(
        { keys: { persisted: {} } as never },
        'm.cross_signing.master'
      )
    ).toEqual(['persisted', privateKey]);
    prepareForCore(client);
    const core = createMatrixJsCore(client);
    await clearSecretStorageKeysForCore(core);
    expect(
      await callbacks.getSecretStorageKey?.(
        { keys: { persisted: {} } as never },
        'm.cross_signing.master'
      )
    ).toBeNull();
    expect(persisted.size).toBe(0);

    const nextClient = await createMatrixJsClient(SESSION);
    expect(
      await clientCallbacks(1).getSecretStorageKey?.(
        { keys: { persisted: {} } as never },
        'm.cross_signing.master'
      )
    ).toBeNull();
    nextClient.stopClient();
    await core.auth.stop();
  });

  it('uses an injected memory store without opening IndexedDB', async () => {
    installIndexedDB([]);
    const store = createMemorySecretStorageKeyStore();
    const client = await createMatrixJsClient(SESSION, { secretStorageKeys: store });
    const callbacks = clientCallbacks();
    const privateKey = new Uint8Array([4, 5, 6]);

    callbacks.cacheSecretStorageKey?.('generated', {} as never, privateKey);
    expect(store.get('generated')).toEqual(privateKey);
    expect(sdkState.events).not.toContain('idb.open');
    prepareForCore(client);
    const core = createMatrixJsCore(client);
    await clearSecretStorageKeysForCore(core);
    expect(store.get('generated')).toBeUndefined();
    callbacks.cacheSecretStorageKey?.('after-reset', {} as never, new Uint8Array([7]));
    expect(store.get('after-reset')).toEqual(new Uint8Array([7]));
    await core.auth.stop();
  });

  it('rejects a different core store for a factory-created client', async () => {
    installIndexedDB([]);
    const client = await createMatrixJsClient(SESSION, {
      secretStorageKeys: createMemorySecretStorageKeyStore(),
    });

    expect(() =>
      createMatrixJsCore(client, { secretStorageKeys: createMemorySecretStorageKeyStore() })
    ).toThrow('Secret storage key store does not match the Matrix client.');
  });

  it('revokes SDK cache callbacks and clears the shared store on logout', async () => {
    installIndexedDB([]);
    const store = createMemorySecretStorageKeyStore();
    const client = await createMatrixJsClient(SESSION, { secretStorageKeys: store });
    const callbacks = clientCallbacks();
    callbacks.cacheSecretStorageKey?.('before', {} as never, new Uint8Array([1]));
    prepareForCore(client);
    client.logout = async () => ({});
    client.clearStores = async () => undefined;
    const core = createMatrixJsCore(client);

    expect((await core.auth.logout()).ok).toBe(true);
    callbacks.cacheSecretStorageKey?.('late', {} as never, new Uint8Array([2]));

    expect(store.get('before')).toBeUndefined();
    expect(store.get('late')).toBeUndefined();
    expect(
      await callbacks.getSecretStorageKey?.(
        { keys: { before: {} } as never },
        'm.cross_signing.master'
      )
    ).toBeNull();
    await core.auth.stop();
  });
});
