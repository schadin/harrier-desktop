import {
  createSnapshotStore,
  type HarrierCore,
  type MemberView,
  type RoomSummaryView,
  type RoomView,
} from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { getCoreDMRoomFor } from './coreRoomDirect';

const TARGET_ID = '@bob:example.org';

const makeMember = (userId: string, membership: MemberView['membership'] = 'join'): MemberView => ({
  userId,
  displayName: userId,
  membership,
  powerLevel: 0,
});

const makeRoom = (roomId: string, overrides: Partial<RoomView> = {}): RoomView => ({
  roomId,
  name: roomId,
  lastActiveTimestamp: 0,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  encrypted: true,
  viaServers: [],
  spaceChildren: [],
  ...overrides,
});

type RoomFixture = {
  readonly summary: RoomSummaryView;
  readonly room: RoomView | null;
  readonly members?: readonly MemberView[];
};

const fixture = (
  room: RoomView,
  members: readonly MemberView[] = [makeMember(TARGET_ID)]
): RoomFixture => ({
  summary: {
    roomId: room.roomId,
    name: room.name,
    lastActiveTimestamp: room.lastActiveTimestamp,
    membership: room.membership,
    isDirect: room.isDirect,
    isSpace: room.isSpace,
  },
  room,
  members,
});

const makeCore = (fixtures: readonly RoomFixture[]): HarrierCore => {
  const roomStores = new Map(
    fixtures.map(({ summary, room }) => [
      summary.roomId,
      createSnapshotStore<RoomView | null>(room),
    ])
  );
  const memberStores = new Map(
    fixtures.map(({ summary, members }) => [
      summary.roomId,
      createSnapshotStore<readonly MemberView[]>(members ?? []),
    ])
  );
  const emptyMembers = createSnapshotStore<readonly MemberView[]>([]);

  return {
    rooms: {
      all: createSnapshotStore(fixtures.map(({ summary }) => summary)),
      list: createSnapshotStore<readonly RoomSummaryView[]>([]),
      room(roomId: string) {
        return roomStores.get(roomId) ?? createSnapshotStore<RoomView | null>(null);
      },
      members(roomId: string) {
        return memberStores.get(roomId) ?? emptyMembers;
      },
    },
  } as unknown as HarrierCore;
};

describe('getCoreDMRoomFor', () => {
  it('selects a joined encrypted room with at most two loaded members and the target', () => {
    const room = makeRoom('!eligible:example.org');
    const core = makeCore([fixture(room, [makeMember('@me:example.org'), makeMember(TARGET_ID)])]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(room);
  });

  it.each(['invite', 'leave'] as const)('does not select a %s room', (membership) => {
    const room = makeRoom('!not-joined:example.org', { membership });
    const core = makeCore([fixture(room)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBeUndefined();
  });

  it('does not select an unencrypted room even when it is marked direct', () => {
    const room = makeRoom('!unencrypted:example.org', { encrypted: false, isDirect: true });
    const core = makeCore([fixture(room)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBeUndefined();
  });

  it('selects an encrypted candidate even when it is not marked direct', () => {
    const room = makeRoom('!legacy-dm:example.org', { isDirect: false });
    const core = makeCore([fixture(room)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(room);
  });

  it('counts all loaded members instead of trusting memberCount', () => {
    const room = makeRoom('!three-members:example.org', { memberCount: 2 });
    const core = makeCore([
      fixture(room, [
        makeMember('@me:example.org'),
        makeMember(TARGET_ID),
        makeMember('@carol:example.org', 'leave'),
      ]),
    ]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBeUndefined();
  });

  it.each(['invite', 'leave'] as const)(
    'selects a two-member room when the target membership is %s',
    (membership) => {
      const room = makeRoom('!target-not-joined:example.org');
      const core = makeCore([
        fixture(room, [makeMember('@me:example.org'), makeMember(TARGET_ID, membership)]),
      ]);

      expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(room);
    }
  );

  it('does not select a room without the target', () => {
    const room = makeRoom('!other-user:example.org');
    const core = makeCore([
      fixture(room, [makeMember('@me:example.org'), makeMember('@al:example.org')]),
    ]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBeUndefined();
  });

  it('ignores dmUserId when selecting the legacy DM-like room', () => {
    const room = makeRoom('!wrong-dm-user:example.org', { dmUserId: '@carol:example.org' });
    const core = makeCore([fixture(room)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(room);
  });

  it('selects the first eligible room in core.rooms.all order', () => {
    const first = makeRoom('!first:example.org');
    const second = makeRoom('!second:example.org');
    const core = makeCore([fixture(first), fixture(second)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(first);
  });

  it('skips a summary whose RoomView is unavailable', () => {
    const missing = makeRoom('!missing:example.org');
    const eligible = makeRoom('!eligible:example.org');
    const core = makeCore([{ ...fixture(missing), room: null }, fixture(eligible)]);

    expect(getCoreDMRoomFor(core, TARGET_ID)).toBe(eligible);
  });
});
