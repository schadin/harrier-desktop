import {
  createSnapshotStore,
  type HarrierCore,
  type MemberView,
  type RoomStateEntry,
  type RoomView,
} from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { classifyInvites, makeInviteData, type InviteData } from './inviteUtils';

const room: RoomView = {
  roomId: '!invite:example.org',
  name: 'Project room',
  membership: 'invite',
  isDirect: true,
  isSpace: false,
  topic: 'Project topic',
  encrypted: true,
  joinRule: 'invite',
  canonicalAlias: '#project:example.org',
  avatarMxc: 'mxc://example.org/room-avatar',
  dmAvatarMxc: 'mxc://example.org/alice-avatar',
  viaServers: ['example.org'],
  spaceChildren: [],
};

const members: MemberView[] = [
  {
    userId: '@me:example.org',
    displayName: 'Me',
    membership: 'invite',
    powerLevel: 0,
  },
  {
    userId: '@alice:example.org',
    displayName: 'Alice',
    rawDisplayName: 'Alice',
    membership: 'invite',
    powerLevel: 0,
    joinedAt: 100,
  },
];

const membershipEvent: RoomStateEntry = {
  stateKey: '@me:example.org',
  sender: '@alice:example.org',
  timestamp: 1234,
  content: {
    membership: 'invite',
    is_direct: true,
    reason: 'Join the project',
  },
};

const createCore = (
  roomView: RoomView | null,
  roomMembers: MemberView[],
  memberEvent: RoomStateEntry | null
): HarrierCore =>
  ({
    auth: {
      session: createSnapshotStore({
        userId: '@me:example.org',
        deviceId: 'DEVICE',
        ready: true,
      }),
    },
    rooms: {
      room: () => createSnapshotStore(roomView),
      members: () => createSnapshotStore(roomMembers),
      stateEntry: () => createSnapshotStore(memberEvent),
    },
  } as unknown as HarrierCore);

const makeInvite = (roomId: string, senderId: string): InviteData => ({
  roomId,
  roomName: roomId,
  senderId,
  senderName: senderId,
  isSpace: false,
  isDirect: false,
  isEncrypted: false,
});

describe('invite data from core snapshots', () => {
  it('builds invite details from room, member, and membership state snapshots', () => {
    const core = createCore(room, members, membershipEvent);

    expect(makeInviteData(core, room.roomId)).toEqual({
      roomId: '!invite:example.org',
      roomName: 'Project room',
      roomTopic: 'Project topic',
      roomAlias: '#project:example.org',
      avatarMxc: 'mxc://example.org/alice-avatar',
      senderId: '@alice:example.org',
      senderName: 'Alice',
      inviteTs: 1234,
      reason: 'Join the project',
      isSpace: false,
      isDirect: true,
      isEncrypted: true,
      dmUserId: '@alice:example.org',
    });
  });

  it('uses the oldest other member when a direct invite has no m.direct mapping', () => {
    const directRoom: RoomView = { ...room, dmUserId: undefined };
    const core = createCore(directRoom, members, membershipEvent);

    expect(makeInviteData(core, room.roomId).dmUserId).toBe('@alice:example.org');
  });

  it('classifies bans as spam and missing shared membership as public', () => {
    const known = makeInvite('!known:example.org', '@known:example.org');
    const unknown = makeInvite('!unknown:example.org', '@unknown:example.org');
    const spam = makeInvite('!spam:example.org', '@banned:example.org');
    const getTestMembers = (roomId: string): MemberView[] => {
      if (roomId === known.roomId) {
        return [
          {
            userId: known.senderId,
            displayName: known.senderId,
            membership: 'join',
            powerLevel: 0,
          },
        ];
      }
      if (roomId === spam.roomId) {
        return [
          {
            userId: spam.senderId,
            displayName: spam.senderId,
            membership: 'ban',
            powerLevel: 0,
          },
        ];
      }
      return [];
    };
    const core = {
      rooms: {
        room: (roomId: string) =>
          createSnapshotStore({ ...room, roomId, membership: 'join' as const }),
        members: (roomId: string) => createSnapshotStore(getTestMembers(roomId)),
      },
    } as unknown as HarrierCore;

    expect(
      classifyInvites(
        core,
        [known, unknown, spam],
        ['!known:example.org', '!spam:example.org']
      ).map((group) => group.map((invite) => invite.roomId))
    ).toEqual([['!known:example.org'], ['!unknown:example.org'], ['!spam:example.org']]);
  });
});
