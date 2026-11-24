import type { HarrierCore, MemberView, RoomView } from '@harrier/core';
import { Membership, StateEvent } from '../../../../types/matrix/room';
import { testBadWords } from '../../../plugins/bad-words';
import { getMxIdLocalPart } from '../../../utils/matrix';

export type InviteData = {
  roomId: string;
  roomName: string;
  avatarMxc?: string;
  roomTopic?: string;
  roomAlias?: string;

  senderId: string;
  senderName: string;
  inviteTs?: number;
  reason?: string;
  dmUserId?: string;

  isSpace: boolean;
  isDirect: boolean;
  isEncrypted: boolean;
};

const getDmUserId = (room: RoomView, members: readonly MemberView[], userId: string) => {
  if (room.dmUserId) return room.dmUserId;
  const otherMembers = members.filter((member) => member.userId !== userId);
  const joinedMembers = otherMembers.filter((member) => member.membership === Membership.Join);
  const candidates = joinedMembers.length > 0 ? joinedMembers : otherMembers;
  return [...candidates].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0))[0]?.userId;
};

export const makeInviteData = (core: HarrierCore, roomId: string): InviteData => {
  const userId = core.auth.session.getSnapshot().value?.userId ?? '';
  const room = core.rooms.room(roomId).getSnapshot().value;
  if (!room) throw new Error(`Invited room ${roomId} not found`);

  const members = core.rooms.members(roomId).getSnapshot().value;
  const memberEvent = core.rooms
    .stateEntry(roomId, StateEvent.RoomMember, userId)
    .getSnapshot().value;
  const content = memberEvent?.content;
  const senderId = memberEvent?.sender;
  const sender = members.find((member) => member.userId === senderId);
  const senderName = senderId
    ? (sender?.rawDisplayName && sender.rawDisplayName !== senderId
        ? sender.rawDisplayName
        : getMxIdLocalPart(senderId)) ?? senderId
    : undefined;
  const direct = content?.is_direct === true;

  return {
    roomId,
    roomName: room.name || room.canonicalAlias || roomId,
    avatarMxc: direct ? room.dmAvatarMxc ?? room.avatarMxc : room.avatarMxc,
    roomTopic: room.topic,
    roomAlias: room.canonicalAlias,
    senderId: senderId ?? 'Unknown',
    senderName: senderName ?? 'Unknown',
    inviteTs: memberEvent?.timestamp,
    reason:
      content && typeof content.reason === 'string' && content.reason.length > 0
        ? content.reason
        : undefined,
    ...(direct ? { dmUserId: getDmUserId(room, members, userId) } : {}),
    isSpace: room.isSpace,
    isDirect: direct,
    isEncrypted: room.encrypted,
  };
};

const hasBadWords = (invite: InviteData): boolean =>
  testBadWords(invite.roomName) ||
  testBadWords(invite.roomTopic ?? '') ||
  testBadWords(invite.senderName) ||
  testBadWords(invite.senderId) ||
  testBadWords(invite.reason || '');

const getMembership = (core: HarrierCore, roomId: string, userId: string) => {
  const room = core.rooms.room(roomId).getSnapshot().value;
  if (!room || room.membership !== Membership.Join) return undefined;
  return core.rooms
    .members(roomId)
    .getSnapshot()
    .value.find((member) => member.userId === userId)?.membership;
};

export const classifyInvites = (
  core: HarrierCore,
  invites: InviteData[],
  joinedRoomIds: readonly string[]
): [InviteData[], InviteData[], InviteData[]] => {
  const known: InviteData[] = [];
  const unknown: InviteData[] = [];
  const spam: InviteData[] = [];

  invites.forEach((invite) => {
    const banned = joinedRoomIds.some(
      (roomId) => getMembership(core, roomId, invite.senderId) === Membership.Ban
    );
    if (hasBadWords(invite) || banned) {
      spam.push(invite);
      return;
    }

    const sharesRoom = joinedRoomIds.some(
      (roomId) => getMembership(core, roomId, invite.senderId) === Membership.Join
    );
    if (!sharesRoom) {
      unknown.push(invite);
      return;
    }
    known.push(invite);
  });

  return [known, unknown, spam];
};
