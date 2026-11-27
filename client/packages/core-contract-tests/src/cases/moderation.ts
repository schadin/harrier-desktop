import type { HarrierCore } from '@harrier/core';
import { expect } from 'vitest';
import { contractTest } from '../suite';

const roomId = '!moderation/room:example.org';
const userId = '@target/user:example.org';
const eventId = '$report/event:example.org';
const encodedRoomId = '!moderation%2Froom%3Aexample.org';
const encodedEventId = '%24report%2Fevent%3Aexample.org';

const commandCases = [
  {
    name: 'kick with a reason',
    path: `/rooms/${encodedRoomId}/kick`,
    body: { user_id: userId, reason: 'Repeated disruption' },
    run: (core: HarrierCore) => core.rooms.kick(roomId, userId, 'Repeated disruption'),
  },
  {
    name: 'kick without a reason',
    path: `/rooms/${encodedRoomId}/kick`,
    body: { user_id: userId },
    run: (core: HarrierCore) => core.rooms.kick(roomId, userId),
  },
  {
    name: 'ban with a reason',
    path: `/rooms/${encodedRoomId}/ban`,
    body: { user_id: userId, reason: 'Spam' },
    run: (core: HarrierCore) => core.rooms.ban(roomId, userId, 'Spam'),
  },
  {
    name: 'ban without a reason',
    path: `/rooms/${encodedRoomId}/ban`,
    body: { user_id: userId },
    run: (core: HarrierCore) => core.rooms.ban(roomId, userId),
  },
  {
    name: 'unban',
    path: `/rooms/${encodedRoomId}/unban`,
    body: { user_id: userId },
    run: (core: HarrierCore) => core.rooms.unban(roomId, userId),
  },
  {
    name: 'event report',
    path: `/rooms/${encodedRoomId}/report/${encodedEventId}`,
    body: { score: -100, reason: 'Abusive content' },
    run: (core: HarrierCore) => core.rooms.reportEvent(roomId, eventId, -100, 'Abusive content'),
  },
  {
    name: 'room report',
    path: `/rooms/${encodedRoomId}/report`,
    body: { reason: 'Spam room' },
    run: (core: HarrierCore) => core.rooms.reportRoom(roomId, 'Spam room'),
  },
] as const;

const roomWithMember = (membership: 'join' | 'leave' | 'ban') => ({
  roomId,
  membership: 'join' as const,
  name: 'Moderation',
  stateEvents: [
    {
      type: 'm.room.member',
      stateKey: userId,
      content: { membership, displayname: 'Target' },
    },
  ],
});

const targetMembership = (core: HarrierCore) =>
  core.rooms
    .members(roomId)
    .getSnapshot()
    .value.find((member) => member.userId === userId)?.membership;

export const moderationCases = [
  ...commandCases.map((command) =>
    contractTest(`${command.name} preserves its serialized request body`, async (harness) => {
      const core = await harness.create();
      try {
        expect(await command.run(core)).toEqual({ ok: true, value: undefined });
        const call = harness.getCalls().find((candidate) => candidate.path === command.path);
        expect(call).toMatchObject({ method: 'POST', path: command.path });
        expect(JSON.parse(JSON.stringify(call?.body))).toEqual(command.body);
      } finally {
        await harness.dispose(core);
      }
    })
  ),

  ...commandCases.flatMap((command) =>
    [403, 429].map((httpStatus) =>
      contractTest(`${command.name} normalizes one-shot HTTP ${httpStatus}`, async (harness) => {
        const core = await harness.create();
        try {
          harness.failNextOperation(command.path, {
            operation: command.path,
            httpStatus,
            errcode: httpStatus === 403 ? 'M_FORBIDDEN' : 'M_LIMIT_EXCEEDED',
            error: httpStatus === 403 ? 'Forbidden' : 'Slow down',
            ...(httpStatus === 429 ? { retryAfterMs: 1250 } : {}),
          });

          const failed = await command.run(core);
          expect(failed.ok).toBe(false);
          if (!failed.ok) {
            expect(failed.error).toMatchObject(
              httpStatus === 403
                ? { code: 'forbidden', retryable: false, httpStatus: 403 }
                : {
                    code: 'rate-limited',
                    retryable: true,
                    httpStatus: 429,
                    retryAfterMs: 1250,
                  }
            );
          }
          expect(harness.getCalls().filter((call) => call.path === command.path)).toHaveLength(1);

          expect(await command.run(core)).toEqual({ ok: true, value: undefined });
          expect(harness.getCalls().filter((call) => call.path === command.path)).toHaveLength(2);
        } finally {
          await harness.dispose(core);
        }
      })
    )
  ),

  ...(['kick', 'ban'] as const).map((action) =>
    contractTest(
      `${action} waits for membership sync before changing snapshots`,
      async (harness) => {
        const core = await harness.create();
        try {
          await harness.applySyncFixture({ rooms: [roomWithMember('join')] });
          const roomStore = core.rooms.room(roomId);
          const memberStore = core.rooms.members(roomId);
          const roomBefore = roomStore.getSnapshot();
          const membersBefore = memberStore.getSnapshot();
          expect(targetMembership(core)).toBe('join');

          const result =
            action === 'kick'
              ? await core.rooms.kick(roomId, userId)
              : await core.rooms.ban(roomId, userId);
          expect(result).toEqual({ ok: true, value: undefined });
          expect(roomStore.getSnapshot()).toBe(roomBefore);
          expect(memberStore.getSnapshot()).toBe(membersBefore);
          expect(targetMembership(core)).toBe('join');

          await harness.applySyncFixture({
            rooms: [roomWithMember(action === 'kick' ? 'leave' : 'ban')],
          });
          expect(roomStore.getSnapshot()).not.toBe(roomBefore);
          expect(memberStore.getSnapshot()).not.toBe(membersBefore);
          expect(targetMembership(core)).toBe(action === 'kick' ? 'leave' : 'ban');
        } finally {
          await harness.dispose(core);
        }
      }
    )
  ),

  contractTest('unban waits for membership sync before changing snapshots', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({ rooms: [roomWithMember('ban')] });
      const roomStore = core.rooms.room(roomId);
      const memberStore = core.rooms.members(roomId);
      const roomBefore = roomStore.getSnapshot();
      const membersBefore = memberStore.getSnapshot();
      expect(targetMembership(core)).toBe('ban');

      expect(await core.rooms.unban(roomId, userId)).toEqual({ ok: true, value: undefined });
      expect(roomStore.getSnapshot()).toBe(roomBefore);
      expect(memberStore.getSnapshot()).toBe(membersBefore);
      expect(targetMembership(core)).toBe('ban');

      await harness.applySyncFixture({ rooms: [roomWithMember('leave')] });
      expect(memberStore.getSnapshot()).not.toBe(membersBefore);
      expect(targetMembership(core)).toBe('leave');
    } finally {
      await harness.dispose(core);
    }
  }),
];
