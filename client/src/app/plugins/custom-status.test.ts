import type { HarrierCore } from '@harrier/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideStatusRestore,
  getActiveStatusMsg,
  restoreCustomStatus,
  saveActiveStatusMsg,
} from './custom-status';

let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const USER_ID = '@user:example.org';

type CoreStub = {
  getOwnPresence: ReturnType<typeof vi.fn>;
  setOwnPresence: ReturnType<typeof vi.fn>;
  setLocalOwnStatus: ReturnType<typeof vi.fn>;
};

const makeCore = (response: Record<string, unknown>): { core: HarrierCore; stub: CoreStub } => {
  const stub: CoreStub = {
    getOwnPresence: vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: {
          userId: USER_ID,
          status: 'unavailable',
          active: false,
          ...response,
        },
      })
    ),
    setOwnPresence: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
    setLocalOwnStatus: vi.fn(),
  };
  const core = {
    auth: { session: { getSnapshot: () => ({ value: { userId: USER_ID } }) } },
    presence: stub,
    send: { sendMessage: vi.fn(() => Promise.resolve({ ok: true, value: '$sent' })) },
  } as unknown as HarrierCore;
  return { core, stub };
};

describe('decideStatusRestore', () => {
  it('ничего не делает, когда сервер пуст и локальный кэш пуст', () => {
    expect(decideStatusRestore(undefined, undefined)).toEqual({ type: 'noop' });
  });

  it('восстанавливает локальный статус, когда сервер не вернул status_msg', () => {
    expect(decideStatusRestore(undefined, '🟢 На месте')).toEqual({
      type: 'restore',
      statusMsg: '🟢 На месте',
    });
  });

  it('синхронизирует кэш с сервером, когда серверный статус отличается', () => {
    expect(decideStatusRestore('🟢 На месте', '🍴 Обед')).toEqual({
      type: 'adopt-server',
      statusMsg: '🟢 На месте',
    });
  });

  it('берёт серверный статус, когда локального кэша нет', () => {
    expect(decideStatusRestore('🍴 Обед', undefined)).toEqual({
      type: 'adopt-server',
      statusMsg: '🍴 Обед',
    });
  });

  it('только показывает совпадающий серверный статус, не меняя кэш', () => {
    expect(decideStatusRestore('🍴 Обед', '🍴 Обед')).toEqual({
      type: 'show-server',
      statusMsg: '🍴 Обед',
    });
  });
});

describe('restoreCustomStatus', () => {
  it('повторяет запрос и не трогает кэш при ошибке getOwnPresence', async () => {
    saveActiveStatusMsg('🍴 Обед');
    const { core, stub } = makeCore({});
    stub.getOwnPresence.mockRejectedValueOnce(new Error('network down'));

    await expect(restoreCustomStatus(core)).resolves.toBe('retry');
    expect(stub.setOwnPresence).not.toHaveBeenCalled();
    expect(getActiveStatusMsg()).toBe('🍴 Обед');
  });

  it('восстанавливает локальный статус, когда сервер вернул пусто, сохраняя presence', async () => {
    saveActiveStatusMsg('🍴 Обед');
    const { core, stub } = makeCore({ statusMessage: undefined });

    await expect(restoreCustomStatus(core)).resolves.toBe('done');
    expect(stub.setOwnPresence).toHaveBeenCalledWith({
      status: 'unavailable',
      statusMessage: '🍴 Обед',
    });
    expect(getActiveStatusMsg()).toBe('🍴 Обед');
  });

  it('синхронизирует локальный кэш с серверным значением без setOwnPresence', async () => {
    saveActiveStatusMsg('🍴 Обед');
    const { core, stub } = makeCore({ statusMessage: '🟢 На месте' });

    await expect(restoreCustomStatus(core)).resolves.toBe('done');
    expect(stub.setOwnPresence).not.toHaveBeenCalled();
    expect(stub.setLocalOwnStatus).toHaveBeenCalledWith('🟢 На месте');
    expect(getActiveStatusMsg()).toBe('🟢 На месте');
  });

  it('не отправляет setOwnPresence, когда значения совпадают', async () => {
    saveActiveStatusMsg('🟢 На месте');
    const { core, stub } = makeCore({ statusMessage: '🟢 На месте' });

    await expect(restoreCustomStatus(core)).resolves.toBe('done');
    expect(stub.setOwnPresence).not.toHaveBeenCalled();
    expect(getActiveStatusMsg()).toBe('🟢 На месте');
  });

  it('не перезаписывает статус, изменённый пользователем за время запроса', async () => {
    saveActiveStatusMsg('🍴 Обед');
    const { core, stub } = makeCore({ statusMessage: '🟢 На месте' });
    let releasePresence: (value: { ok: true; value: Record<string, unknown> }) => void = () => {};
    stub.getOwnPresence.mockReturnValueOnce(
      new Promise((resolve) => {
        releasePresence = resolve;
      })
    );

    const pending = restoreCustomStatus(core);
    saveActiveStatusMsg('🏁 Ушел');
    releasePresence({ ok: true, value: { statusMessage: '🟢 На месте' } });

    await expect(pending).resolves.toBe('done');
    expect(stub.setOwnPresence).not.toHaveBeenCalled();
    expect(getActiveStatusMsg()).toBe('🏁 Ушел');
  });
});
