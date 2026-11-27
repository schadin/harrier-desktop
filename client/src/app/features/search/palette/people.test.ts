import {
  createSnapshotStore,
  type HarrierCore,
  type MemberView,
  type RoomSummaryView,
  type RoomView,
  type UserProfileView,
} from '@harrier/core';
import { describe, expect, it, vi } from 'vitest';
import { buildPeoplePaletteItems } from './people';
import { PaletteCategory } from './types';

const MY_USER_ID = '@me:example.org';
const TARGET_ID = '@bob:example.org';

const makeMember = (userId: string): MemberView => ({
  userId,
  displayName: userId,
  membership: 'join',
  powerLevel: 0,
});

const makeRoom = (roomId: string): RoomView => ({
  roomId,
  name: roomId,
  lastActiveTimestamp: 0,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  encrypted: true,
  viaServers: [],
  spaceChildren: [],
});

const makeCore = (room?: RoomView) => {
  const allStore = createSnapshotStore<readonly RoomSummaryView[]>([]);
  const roomStore = createSnapshotStore<RoomView | null>(room ?? null);
  const memberStore = createSnapshotStore<readonly MemberView[]>(
    room ? [makeMember(MY_USER_ID), makeMember(TARGET_ID)] : []
  );
  const core = {
    rooms: {
      all: allStore,
      room: () => roomStore,
      members: () => memberStore,
    },
  } as unknown as HarrierCore;
  return { core, allStore };
};

const makeNavigation = () => ({
  navigateRoom: vi.fn(),
  navigateDirectCreate: vi.fn(),
});

describe('buildPeoplePaletteItems', () => {
  it('excludes self and users without a display name or DM partnership', () => {
    const users: readonly UserProfileView[] = [
      { userId: '@zoe:example.org', displayName: 'Zoe' },
      { userId: MY_USER_ID, displayName: 'Me' },
      { userId: '@alice:example.org' },
      { userId: '@unknown:example.org' },
    ];
    const { core } = makeCore();
    const navigation = makeNavigation();

    const items = buildPeoplePaletteItems(
      core,
      users,
      MY_USER_ID,
      new Set(['@alice:example.org']),
      navigation
    );

    expect(items.map(({ id }) => id)).toEqual(['user:@zoe:example.org', 'user:@alice:example.org']);
  });

  it('uses the core profile display name and preserves input order', () => {
    const users: readonly UserProfileView[] = [
      { userId: '@zoe:example.org', displayName: 'Zoe' },
      { userId: '@alice:example.org', displayName: 'Alice' },
    ];
    const { core } = makeCore();
    const navigation = makeNavigation();

    const items = buildPeoplePaletteItems(core, users, MY_USER_ID, new Set(), navigation);

    expect(items.map(({ title }) => title)).toEqual(['Zoe', 'Alice']);
  });

  it('uses localpart for a DM partner without a display name', () => {
    const user: UserProfileView = { userId: TARGET_ID };
    const { core } = makeCore();
    const navigation = makeNavigation();

    const [item] = buildPeoplePaletteItems(
      core,
      [user],
      MY_USER_ID,
      new Set([TARGET_ID]),
      navigation
    );

    expect(item).toMatchObject({
      id: `user:${TARGET_ID}`,
      category: PaletteCategory.People,
      title: 'bob',
      subtitle: TARGET_ID,
      keywords: [TARGET_ID, 'bob'],
      dm: true,
    });
  });

  it('preserves an SDK display name equal to the full user ID', () => {
    const { core } = makeCore();
    const navigation = makeNavigation();

    const [item] = buildPeoplePaletteItems(
      core,
      [{ userId: TARGET_ID, displayName: TARGET_ID }],
      MY_USER_ID,
      new Set(),
      navigation
    );

    expect(item.title).toBe(TARGET_ID);
  });

  it('keeps avatar data in the source profile without adding people avatar UI', () => {
    const user: UserProfileView = {
      userId: TARGET_ID,
      displayName: 'Bob',
      avatarUrl: 'mxc://example.org/bob',
    };
    const { core } = makeCore();
    const navigation = makeNavigation();

    const [item] = buildPeoplePaletteItems(core, [user], MY_USER_ID, new Set(), navigation);

    expect(user.avatarUrl).toBe('mxc://example.org/bob');
    expect(item).not.toHaveProperty('avatarUrl');
    expect(item).not.toHaveProperty('roomId');
  });

  it('opens the first current core DM-like room when the item runs', () => {
    const room = makeRoom('!current-dm:example.org');
    const { core, allStore } = makeCore(room);
    const navigation = makeNavigation();
    const [item] = buildPeoplePaletteItems(
      core,
      [{ userId: TARGET_ID, displayName: 'Bob' }],
      MY_USER_ID,
      new Set(),
      navigation
    );

    allStore.publish([
      {
        roomId: room.roomId,
        name: room.name,
        lastActiveTimestamp: 0,
        membership: 'join',
        isDirect: false,
        isSpace: false,
      },
    ]);
    item.run();

    expect(navigation.navigateRoom).toHaveBeenCalledWith(room.roomId);
    expect(navigation.navigateDirectCreate).not.toHaveBeenCalled();
  });

  it('passes the user ID to direct creation when no core DM-like room exists', () => {
    const { core } = makeCore();
    const navigation = makeNavigation();
    const [item] = buildPeoplePaletteItems(
      core,
      [{ userId: TARGET_ID, displayName: 'Bob' }],
      MY_USER_ID,
      new Set(),
      navigation
    );

    item.run();

    expect(navigation.navigateDirectCreate).toHaveBeenCalledWith(TARGET_ID);
    expect(navigation.navigateRoom).not.toHaveBeenCalled();
  });
});
