import { CoreError, createSnapshotStore, type HarrierCore, type JsonObject } from '@harrier/core';
import { describe, expect, it, vi } from 'vitest';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { addRoomIdToMDirect, createPrivateRoomAndInvite, setIgnoredUsers } from './coreRoomActions';

const createCore = (
  direct: JsonObject | null,
  operations: {
    createRoom?: ReturnType<typeof vi.fn>;
    invite?: ReturnType<typeof vi.fn>;
    setAccountData?: ReturnType<typeof vi.fn>;
  } = {}
): HarrierCore => {
  const accountData = createSnapshotStore(direct);
  const setAccountData =
    operations.setAccountData ??
    vi.fn(async (_type: string, content: JsonObject) => {
      accountData.publish(content);
      return { ok: true, value: undefined } as const;
    });

  return {
    auth: {
      accountData: () => accountData,
      setAccountData,
    },
    rooms: {
      createRoom:
        operations.createRoom ??
        vi.fn(async () => ({ ok: true, value: '!new:example.org' } as const)),
      invite: operations.invite ?? vi.fn(async () => ({ ok: true, value: undefined } as const)),
    },
  } as unknown as HarrierCore;
};

describe('core room actions', () => {
  it('moves a direct room to the selected user without duplicating it', async () => {
    const core = createCore({
      '@alice:example.org': ['!dm:example.org', '!other:example.org'],
      '@bob:example.org': ['!bob-room:example.org'],
    });

    await addRoomIdToMDirect(core, '!dm:example.org', '@bob:example.org');
    await addRoomIdToMDirect(core, '!dm:example.org', '@bob:example.org');

    expect(core.auth.accountData(AccountDataEvent.Direct).getSnapshot().value).toEqual({
      '@alice:example.org': ['!other:example.org'],
      '@bob:example.org': ['!bob-room:example.org', '!dm:example.org'],
    });
  });

  it('creates a private room, invites the user, and records the direct room', async () => {
    const calls: string[] = [];
    const createRoom = vi.fn(async () => {
      calls.push('create');
      return { ok: true, value: '!new:example.org' } as const;
    });
    const invite = vi.fn(async () => {
      calls.push('invite');
      return { ok: true, value: undefined } as const;
    });
    const setAccountData = vi.fn(async () => {
      calls.push('account-data');
      return { ok: true, value: undefined } as const;
    });
    const core = createCore(null, { createRoom, invite, setAccountData });

    await expect(
      createPrivateRoomAndInvite(core, {
        userId: '@alice:example.org',
        encrypted: true,
        version: '12',
      })
    ).resolves.toBe('!new:example.org');

    expect(createRoom).toHaveBeenCalledWith({
      version: '12',
      access: 'private',
      knock: false,
      name: '',
      encryption: true,
      allowFederation: true,
    });
    expect(invite).toHaveBeenCalledWith('!new:example.org', '@alice:example.org');
    expect(setAccountData).toHaveBeenCalledWith(AccountDataEvent.Direct, {
      '@alice:example.org': ['!new:example.org'],
    });
    expect(calls).toEqual(['create', 'invite', 'account-data']);
  });

  it('does not invite or update account data when room creation fails', async () => {
    const error = new CoreError('forbidden', 'Room creation forbidden');
    const createRoom = vi.fn(async () => ({ ok: false, error } as const));
    const invite = vi.fn();
    const setAccountData = vi.fn();
    const core = createCore(null, { createRoom, invite, setAccountData });

    await expect(
      createPrivateRoomAndInvite(core, {
        userId: '@alice:example.org',
        encrypted: false,
        version: '12',
      })
    ).rejects.toBe(error);

    expect(invite).not.toHaveBeenCalled();
    expect(setAccountData).not.toHaveBeenCalled();
  });

  it('propagates direct account data failures', async () => {
    const error = new CoreError('network', 'Offline');
    const setAccountData = vi.fn(async () => ({ ok: false, error } as const));
    const core = createCore(null, { setAccountData });

    await expect(addRoomIdToMDirect(core, '!dm:example.org', '@alice:example.org')).rejects.toBe(
      error
    );
  });

  it('stores ignored users through core account data', async () => {
    const setAccountData = vi.fn(async () => ({ ok: true, value: undefined } as const));
    const core = createCore(null, { setAccountData });

    await setIgnoredUsers(core, ['@alice:example.org', '@bob:example.org']);

    expect(setAccountData).toHaveBeenCalledWith(AccountDataEvent.IgnoredUserList, {
      ignored_users: {
        '@alice:example.org': {},
        '@bob:example.org': {},
      },
    });
  });
});
