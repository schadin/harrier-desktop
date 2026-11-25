import { expect } from 'vitest';
import { contractTest } from '../suite';

export const roomsCases = [
  contractTest('joined rooms are listed with their names', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          { roomId: '!general:example.org', membership: 'join', name: 'General' },
          { roomId: '!invite:example.org', membership: 'invite', name: 'Invite' },
        ],
      });
      const rooms = core.rooms.list.getSnapshot().value;
      expect(rooms.map((room) => [room.roomId, room.name, room.membership])).toEqual([
        ['!general:example.org', 'General', 'join'],
      ]);
      expect(core.rooms.all.getSnapshot().value.map((room) => room.membership)).toEqual([
        'join',
        'invite',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('empty rooms expose the minimum safe activity timestamp', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!empty:example.org', membership: 'join', name: 'Empty' }],
      });
      const [allRoom] = core.rooms.all.getSnapshot().value;
      const [listedRoom] = core.rooms.list.getSnapshot().value;
      const room = core.rooms.room('!empty:example.org').getSnapshot().value;

      expect(allRoom?.lastActiveTimestamp).toBe(Number.MIN_SAFE_INTEGER);
      expect(listedRoom?.lastActiveTimestamp).toBe(Number.MIN_SAFE_INTEGER);
      expect(room?.lastActiveTimestamp).toBe(Number.MIN_SAFE_INTEGER);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('left rooms disappear from the joined list', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!general:example.org', membership: 'join', name: 'General' }],
      });
      await harness.applySyncFixture({
        rooms: [{ roomId: '!general:example.org', membership: 'leave', name: 'General' }],
      });
      expect(core.rooms.list.getSnapshot().value).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('direct rooms are flagged from m.direct account data', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!dm:example.org', membership: 'join', name: 'Alice', direct: true }],
      });
      const [room] = core.rooms.list.getSnapshot().value;
      expect(room?.isDirect).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('space rooms are flagged isSpace', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!space:example.org', membership: 'join', name: 'Team', space: true }],
      });
      const [room] = core.rooms.list.getSnapshot().value;
      expect(room?.isSpace).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('room type is exposed by every room projection', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!call:example.org',
            membership: 'join',
            name: 'Call',
            roomType: 'org.matrix.msc3417.call',
          },
        ],
      });
      const [allRoom] = core.rooms.all.getSnapshot().value;
      const [listedRoom] = core.rooms.list.getSnapshot().value;
      const room = core.rooms.room('!call:example.org').getSnapshot().value;

      expect(allRoom?.roomType).toBe('org.matrix.msc3417.call');
      expect(listedRoom?.roomType).toBe('org.matrix.msc3417.call');
      expect(room?.roomType).toBe('org.matrix.msc3417.call');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('m.room.create updates every room classification projection', async (harness) => {
    const core = await harness.create();
    const roomId = '!classified:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId, membership: 'join', name: 'Classified' }],
      });
      const initialAll = core.rooms.all.getSnapshot();
      expect(initialAll.value[0]?.isSpace).toBe(false);
      expect(initialAll.value[0]?.roomType).toBeUndefined();

      await harness.applySyncFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            name: 'Classified',
            stateEvents: [{ type: 'm.room.create', stateKey: '', content: { type: 'm.space' } }],
          },
        ],
      });

      const [allRoom] = core.rooms.all.getSnapshot().value;
      const [listedRoom] = core.rooms.list.getSnapshot().value;
      const room = core.rooms.room(roomId).getSnapshot().value;
      expect(core.rooms.all.getSnapshot()).not.toBe(initialAll);
      expect([allRoom?.isSpace, listedRoom?.isSpace, room?.isSpace]).toEqual([true, true, true]);
      expect([allRoom?.roomType, listedRoom?.roomType, room?.roomType]).toEqual([
        'm.space',
        'm.space',
        'm.space',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('room state is readable through rooms.getState', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!general:example.org', membership: 'join', name: 'General' }],
      });
      const result = await core.rooms.getState('!general:example.org', 'm.room.name', '');
      expect(result).toEqual({ ok: true, value: { name: 'General' } });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('space children are listed in hierarchy order', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!space:example.org',
            membership: 'join',
            name: 'Team',
            space: true,
            children: ['!a:example.org', '!b:example.org'],
          },
          { roomId: '!a:example.org', membership: 'join', name: 'A' },
          { roomId: '!b:example.org', membership: 'join', name: 'B' },
        ],
      });
      const result = await core.rooms.children('!space:example.org');
      expect(result).toEqual({ ok: true, value: ['!a:example.org', '!b:example.org'] });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('incremental sync keeps rooms it does not mention', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      await harness.applySyncFixture({
        rooms: [{ roomId: '!b:example.org', membership: 'join', name: 'B' }],
      });
      expect(core.rooms.list.getSnapshot().value.map((room) => room.roomId)).toEqual([
        '!a:example.org',
        '!b:example.org',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('incremental sync updates an existing room name', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'Old' }],
      });
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'New' }],
      });
      expect(core.rooms.list.getSnapshot().value[0]?.name).toBe('New');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('room view exposes topic and encryption', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            topic: 'Discuss Harrier',
            encrypted: true,
          },
        ],
      });
      const room = core.rooms.room('!room:example.org').getSnapshot().value;
      expect(room?.topic).toBe('Discuss Harrier');
      expect(room?.encrypted).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('room view follows live name updates', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'Old' }],
      });
      expect(core.rooms.room('!a:example.org').getSnapshot().value?.name).toBe('Old');
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'New' }],
      });
      expect(core.rooms.room('!a:example.org').getSnapshot().value?.name).toBe('New');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('state listeners observe recalculated room names', async (harness) => {
    const core = await harness.create();
    const roomId = '!name-refresh:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId, membership: 'join', name: 'Old name' }],
      });
      let observedName: string | undefined;
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId !== roomId || entry.eventType !== 'm.room.name') return;
        observedName = core.rooms.room(roomId).getSnapshot().value?.name;
        expect(core.rooms.all.getSnapshot().value[0]?.name).toBe('New name');
        expect(core.rooms.list.getSnapshot().value[0]?.name).toBe('New name');
        expect(observedName).toBe('New name');
      });

      try {
        await harness.applySyncFixture({
          rooms: [{ roomId, membership: 'join', name: 'New name' }],
        });
        expect(observedName).toBe('New name');
        expect(core.rooms.room(roomId).getSnapshot().value?.name).toBe('New name');
      } finally {
        unsubscribe();
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('no-op explicit names do not block later state listeners', async (harness) => {
    const core = await harness.create();
    const roomId = '!noop-name:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId, membership: 'join' }],
      });
      expect(core.rooms.room(roomId).getSnapshot().value?.name).toBe('Empty room');
      const observedTypes: string[] = [];
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId === roomId) observedTypes.push(entry.eventType);
      });

      try {
        await harness.applySyncFixture({
          rooms: [{ roomId, membership: 'join', name: 'Empty room' }],
        });
        await harness.applySyncFixture({
          rooms: [{ roomId, membership: 'join', topic: 'After no-op name' }],
        });

        expect(observedTypes).toEqual(['m.room.name', 'm.room.topic']);
        expect(core.rooms.state(roomId, 'm.room.topic').getSnapshot().value).toEqual({
          topic: 'After no-op name',
        });
      } finally {
        unsubscribe();
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('state listeners observe derived names after member joins', async (harness) => {
    const core = await harness.create();
    const roomId = '!derived-name:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId, membership: 'join' }],
      });
      let observedName: string | undefined;
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId !== roomId || entry.eventType !== 'm.room.member') return;
        if (entry.stateKey !== '@alice:example.org') return;
        observedName = core.rooms.room(roomId).getSnapshot().value?.name;
        expect(observedName).toBe('Empty room (was Alice)');
      });

      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId,
              membership: 'join',
              members: [{ userId: '@alice:example.org', displayName: 'Alice' }],
            },
          ],
        });
        expect(observedName).toBe('Empty room (was Alice)');
        expect(core.rooms.room(roomId).getSnapshot().value?.name).toBe('Empty room (was Alice)');
      } finally {
        unsubscribe();
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('state listeners observe updated member counts', async (harness) => {
    const core = await harness.create();
    const roomId = '!member-refresh:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            name: 'Members',
            members: [{ userId: '@alice:example.org', displayName: 'Alice' }],
          },
        ],
      });
      expect(core.rooms.room(roomId).getSnapshot().value?.memberCount).toBe(1);
      let observedMemberCount: number | undefined;
      const unsubscribe = core.rooms.onState((entry) => {
        if (entry.roomId !== roomId || entry.eventType !== 'm.room.member') return;
        if (entry.stateKey !== '@bob:example.org') return;
        observedMemberCount = core.rooms.room(roomId).getSnapshot().value?.memberCount;
        expect(observedMemberCount).toBe(2);
      });

      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId,
              membership: 'join',
              members: [{ userId: '@bob:example.org', displayName: 'Bob' }],
            },
          ],
        });
        expect(observedMemberCount).toBe(2);
        expect(core.rooms.room(roomId).getSnapshot().value?.memberCount).toBe(2);
      } finally {
        unsubscribe();
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'room activity follows the last live timeline event across syncs',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!activity:example.org',
              membership: 'join',
              name: 'Activity',
              backwardToken: 'history-start',
              messages: [
                {
                  eventId: '$newer-timestamp',
                  sender: '@alice:example.org',
                  body: 'Earlier in the live timeline',
                  timestamp: 200,
                },
                {
                  eventId: '$last-live-event',
                  sender: '@bob:example.org',
                  body: 'Last in the live timeline',
                  timestamp: 100,
                },
              ],
              history: {
                messages: [
                  {
                    eventId: '$history-only',
                    sender: '@alice:example.org',
                    body: 'Back-pagination only',
                    timestamp: 500,
                  },
                ],
              },
            },
          ],
        });

        expect(core.rooms.all.getSnapshot().value[0]?.lastActiveTimestamp).toBe(100);
        expect(core.rooms.list.getSnapshot().value[0]?.lastActiveTimestamp).toBe(100);
        expect(
          core.rooms.room('!activity:example.org').getSnapshot().value?.lastActiveTimestamp
        ).toBe(100);

        const timeline = core.timeline.timeline('!activity:example.org');
        const pagination = await core.timeline.paginateBackward('!activity:example.org', 10);
        expect(pagination).toEqual({ ok: true, value: undefined });
        expect(timeline.getSnapshot().value.items.map((item) => item.eventId)).toContain(
          '$history-only'
        );
        expect(core.rooms.all.getSnapshot().value[0]?.lastActiveTimestamp).toBe(100);
        expect(core.rooms.list.getSnapshot().value[0]?.lastActiveTimestamp).toBe(100);
        expect(
          core.rooms.room('!activity:example.org').getSnapshot().value?.lastActiveTimestamp
        ).toBe(100);

        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!activity:example.org',
              membership: 'join',
              messages: [
                {
                  eventId: '$incremental-live-event',
                  sender: '@alice:example.org',
                  body: 'Incremental live event',
                  timestamp: 150,
                },
              ],
            },
          ],
        });

        expect(core.rooms.all.getSnapshot().value[0]?.lastActiveTimestamp).toBe(150);
        expect(core.rooms.list.getSnapshot().value[0]?.lastActiveTimestamp).toBe(150);
        expect(
          core.rooms.room('!activity:example.org').getSnapshot().value?.lastActiveTimestamp
        ).toBe(150);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'receipt-only refreshes preserve room snapshots and activity revisions',
    async (harness) => {
      const core = await harness.create();
      try {
        const roomId = '!receipts:example.org';
        await harness.applySyncFixture({
          rooms: [
            {
              roomId,
              membership: 'join',
              name: 'Receipts',
              messages: [
                {
                  eventId: '$message',
                  sender: '@alice:example.org',
                  body: 'Hello',
                  timestamp: 321,
                },
              ],
            },
          ],
        });
        const roomStore = core.rooms.room(roomId);
        const allBefore = core.rooms.all.getSnapshot();
        const listBefore = core.rooms.list.getSnapshot();
        const roomBefore = roomStore.getSnapshot();

        await harness.applySyncFixture({
          rooms: [
            {
              roomId,
              membership: 'join',
              receipts: [{ eventId: '$message', userId: '@bob:example.org' }],
            },
          ],
        });

        expect(core.rooms.all.getSnapshot()).toBe(allBefore);
        expect(core.rooms.list.getSnapshot()).toBe(listBefore);
        expect(roomStore.getSnapshot()).toBe(roomBefore);
        expect(roomStore.getSnapshot().value?.lastActiveTimestamp).toBe(321);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('room view exposes the version from m.room.create', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!versioned:example.org',
            membership: 'join',
            name: 'Versioned',
            roomVersion: '12',
          },
        ],
      });
      expect(core.rooms.room('!versioned:example.org').getSnapshot().value?.roomVersion).toBe('12');
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('members snapshot follows membership updates', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            members: [{ userId: '@alice:example.org', displayName: 'Alice' }],
          },
        ],
      });
      expect(core.rooms.members('!a:example.org').getSnapshot().value).toHaveLength(1);
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            members: [
              { userId: '@alice:example.org', displayName: 'Alice' },
              { userId: '@bob:example.org', displayName: 'Bob' },
            ],
          },
        ],
      });
      const members = core.rooms.members('!a:example.org').getSnapshot().value;
      expect(members.map((member) => member.userId)).toEqual([
        '@alice:example.org',
        '@bob:example.org',
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('power levels are exposed with defaults when no event exists', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      const powerLevels = core.rooms.powerLevels('!a:example.org').getSnapshot().value;
      expect(powerLevels).toMatchObject({
        users_default: 0,
        state_default: 50,
        events_default: 0,
        invite: 0,
        redact: 50,
        kick: 50,
        ban: 50,
        notifications: { room: 50 },
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('power levels follow room updates', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      expect(core.rooms.powerLevels('!a:example.org').getSnapshot().value.invite).toBe(0);
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            powerLevels: { invite: 100, users: { '@alice:example.org': 50 } },
          },
        ],
      });
      const powerLevels = core.rooms.powerLevels('!a:example.org').getSnapshot().value;
      expect(powerLevels.invite).toBe(100);
      expect(powerLevels.users?.['@alice:example.org']).toBe(50);
      expect(powerLevels.state_default).toBe(50);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('creators are exposed for versioned rooms', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            roomVersion: '12',
            additionalCreators: ['@bob:example.org'],
          },
          { roomId: '!old:example.org', membership: 'join', name: 'Old', roomVersion: '9' },
        ],
      });
      expect(core.rooms.creators('!a:example.org').getSnapshot().value).toEqual([
        '@tester:example.org',
        '@bob:example.org',
      ]);
      expect(core.rooms.creators('!old:example.org').getSnapshot().value).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('room account data is exposed by type and follows updates', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            accountData: { 'm.fully_read': { event_id: '$read:example.org' } },
          },
        ],
      });
      expect(core.rooms.accountData('!a:example.org').getSnapshot().value).toEqual([
        { type: 'm.fully_read', content: { event_id: '$read:example.org' } },
      ]);
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'A',
            accountData: {
              'm.fully_read': { event_id: '$read2:example.org' },
              'com.example.flag': { enabled: true },
            },
          },
        ],
      });
      const entries = core.rooms.accountData('!a:example.org').getSnapshot().value;
      expect(entries).toContainEqual({
        type: 'm.fully_read',
        content: { event_id: '$read2:example.org' },
      });
      expect(entries).toContainEqual({
        type: 'com.example.flag',
        content: { enabled: true },
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('parents are resolved through space children', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!space:example.org',
            membership: 'join',
            name: 'Team',
            space: true,
            children: ['!a:example.org', '!b:example.org'],
          },
          { roomId: '!a:example.org', membership: 'join', name: 'A' },
          { roomId: '!b:example.org', membership: 'join', name: 'B' },
        ],
      });
      expect(core.rooms.parents('!a:example.org').getSnapshot().value).toEqual([
        '!space:example.org',
      ]);
      expect(core.rooms.parents('!space:example.org').getSnapshot().value).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('space cycles are broken while resolving parents', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!a:example.org',
            membership: 'join',
            name: 'Space A',
            space: true,
            children: ['!b:example.org'],
          },
          {
            roomId: '!b:example.org',
            membership: 'join',
            name: 'Space B',
            space: true,
            children: ['!a:example.org'],
          },
        ],
      });
      expect(core.rooms.parents('!b:example.org').getSnapshot().value).toEqual(['!a:example.org']);
      expect(core.rooms.parents('!a:example.org').getSnapshot().value).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('join resolves the joined room id', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.rooms.join('!room:example.org', ['example.org']);
      expect(result).toEqual({ ok: true, value: '!room:example.org' });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('leave completes for a joined room', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      const result = await core.rooms.leave('!a:example.org');
      expect(result.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('invite completes with and without reason', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      expect((await core.rooms.invite('!a:example.org', '@alice:example.org')).ok).toBe(true);
      expect((await core.rooms.invite('!a:example.org', '@bob:example.org', 'Join us')).ok).toBe(
        true
      );
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('members expose avatar and power level', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            powerLevels: { users: { '@alice:example.org': 50 } },
            members: [
              {
                userId: '@alice:example.org',
                displayName: 'Alice',
                avatarUrl: 'mxc://example.org/alice-avatar',
              },
              { userId: '@bob:example.org', displayName: 'Bob' },
            ],
          },
        ],
      });
      const members = core.rooms.members('!room:example.org').getSnapshot().value;
      const alice = members.find((member) => member.userId === '@alice:example.org');
      const bob = members.find((member) => member.userId === '@bob:example.org');
      expect(alice?.avatarMxc).toBe('mxc://example.org/alice-avatar');
      expect(alice?.powerLevel).toBe(50);
      expect(bob?.avatarMxc).toBeUndefined();
      expect(bob?.powerLevel).toBe(0);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('createRoom resolves the created room id', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.rooms.createRoom({
        version: '10',
        access: 'private',
        knock: false,
        name: 'New Room',
        allowFederation: true,
      });
      expect(result).toEqual({ ok: true, value: '!created:example.org' });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('upgrade resolves the replacement room id', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.rooms.upgrade('!room:example.org', {
        newVersion: '10',
        additionalCreators: ['@alice:example.org'],
      });
      expect(result).toEqual({ ok: true, value: '!upgraded:example.org' });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('createRoom with restricted parent completes', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!space:example.org', membership: 'join', name: 'Team', space: true }],
      });
      const result = await core.rooms.createRoom({
        version: '12',
        access: 'restricted',
        knock: false,
        name: 'Child Room',
        allowFederation: true,
        parent: { roomId: '!space:example.org', via: ['example.org'] },
      });
      expect(result.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('searchDirectory maps directory rooms with pagination', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.rooms.searchDirectory({
        server: 'matrix.example.org',
        limit: 10,
        searchTerm: 'public',
        roomTypes: ['m.space'],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nextBatch).toBe('page-2');
        expect(result.value.rooms).toEqual([
          {
            roomId: '!public:example.org',
            name: 'Public Room',
            topic: 'A public room',
            avatarMxc: 'mxc://example.org/public-avatar',
            canonicalAlias: '#public:example.org',
            joinRule: undefined,
            roomType: undefined,
            joinedMembers: 42,
            worldReadable: true,
            guestCanJoin: false,
          },
        ]);
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('hierarchy maps federated hierarchy rooms', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!space:example.org', membership: 'join', name: 'Team', space: true }],
      });
      const result = await core.rooms.hierarchy('!space:example.org', { limit: 20 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rooms).toEqual([
          {
            roomId: '!child:example.org',
            name: 'Child Room',
            topic: undefined,
            avatarMxc: undefined,
            canonicalAlias: undefined,
            joinRule: undefined,
            roomType: undefined,
            joinedMembers: 7,
            worldReadable: false,
            guestCanJoin: true,
          },
        ]);
      }
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('state snapshots expose event content and follow updates', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'Old', topic: 'First' }],
      });
      expect(core.rooms.state('!a:example.org', 'm.room.topic').getSnapshot().value).toEqual({
        topic: 'First',
      });
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'New', topic: 'Second' }],
      });
      expect(core.rooms.state('!a:example.org', 'm.room.topic').getSnapshot().value).toEqual({
        topic: 'Second',
      });
      expect(core.rooms.state('!a:example.org', 'm.room.name').getSnapshot().value).toEqual({
        name: 'New',
      });
      expect(
        core.rooms.state('!a:example.org', 'm.room.encryption').getSnapshot().value
      ).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'stateList exposes all state keys of a type and follows updates',
    async (harness) => {
      const core = await harness.create();
      try {
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!a:example.org',
              membership: 'join',
              name: 'A',
              stateEvents: [
                {
                  type: 'im.ponies.room_emotes',
                  stateKey: 'pack1',
                  content: { pack: { display_name: 'Pack One' } },
                },
                {
                  type: 'im.ponies.room_emotes',
                  stateKey: 'pack2',
                  content: { pack: { display_name: 'Pack Two' } },
                },
              ],
            },
          ],
        });
        expect(
          core.rooms.stateList('!a:example.org', 'im.ponies.room_emotes').getSnapshot().value
        ).toEqual([
          {
            stateKey: 'pack1',
            content: { pack: { display_name: 'Pack One' } },
            eventId: expect.any(String),
            sender: '@tester:example.org',
            timestamp: expect.any(Number),
          },
          {
            stateKey: 'pack2',
            content: { pack: { display_name: 'Pack Two' } },
            eventId: expect.any(String),
            sender: '@tester:example.org',
            timestamp: expect.any(Number),
          },
        ]);
        await harness.applySyncFixture({
          rooms: [
            {
              roomId: '!a:example.org',
              membership: 'join',
              name: 'A',
              stateEvents: [
                {
                  type: 'im.ponies.room_emotes',
                  stateKey: 'pack1',
                  content: { pack: { display_name: 'Pack One v2' } },
                },
              ],
            },
          ],
        });
        const entries = core.rooms
          .stateList('!a:example.org', 'im.ponies.room_emotes')
          .getSnapshot().value;
        expect(entries).toHaveLength(2);
        expect(entries[0]?.content).toEqual({ pack: { display_name: 'Pack One v2' } });
        expect(entries[1]?.content).toEqual({ pack: { display_name: 'Pack Two' } });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'onState listeners observe refreshed hierarchy and unread snapshots',
    async (harness) => {
      const core = await harness.create();
      const spaceId = '!space:example.org';
      const childId = '!child:example.org';
      try {
        await harness.applySyncFixture({
          rooms: [
            { roomId: spaceId, membership: 'join', name: 'Space', space: true },
            {
              roomId: childId,
              membership: 'join',
              name: 'Child',
              unread: { total: 2, highlight: 1 },
            },
          ],
        });
        const stateList = core.rooms.stateList(spaceId, 'm.space.child');
        const parents = core.rooms.parents(childId);
        const roomStore = core.rooms.room(spaceId);
        const { unreads } = core.rooms;
        let observedChild = false;
        const unsubscribe = core.rooms.onState((entry) => {
          if (
            entry.roomId !== spaceId ||
            entry.eventType !== 'm.space.child' ||
            entry.stateKey !== childId
          ) {
            return;
          }
          observedChild = true;
          expect(stateList.getSnapshot().value).toEqual([
            expect.objectContaining({
              stateKey: childId,
              content: { via: ['example.org'] },
            }),
          ]);
          expect(parents.getSnapshot().value).toEqual([spaceId]);
          expect(roomStore.getSnapshot().value?.spaceChildren).toEqual([childId]);
          expect(unreads.getSnapshot().value).toContainEqual({
            roomId: spaceId,
            unread: { total: 2, highlight: 1 },
          });
        });

        try {
          await harness.applySyncFixture({
            rooms: [
              {
                roomId: spaceId,
                membership: 'join',
                name: 'Space',
                space: true,
                children: [childId],
              },
            ],
          });
          expect(observedChild).toBe(true);
        } finally {
          unsubscribe();
        }
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('sendState completes through the fake transport', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      const result = await core.rooms.sendState('!a:example.org', 'm.room.topic', {
        topic: 'Updated',
      });
      expect(result.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('setAccountData completes through the fake transport', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId: '!a:example.org', membership: 'join', name: 'A' }],
      });
      const result = await core.rooms.setAccountData('!a:example.org', 'com.example.flag', {
        enabled: true,
      });
      expect(result.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('members are exposed with display names and membership', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [
          {
            roomId: '!room:example.org',
            membership: 'join',
            name: 'Room',
            members: [
              { userId: '@alice:example.org', displayName: 'Alice' },
              { userId: '@bob:example.org', displayName: 'Bob', membership: 'invite' },
            ],
          },
        ],
      });
      const members = core.rooms.members('!room:example.org').getSnapshot().value;
      expect(members).toEqual([
        expect.objectContaining({
          userId: '@alice:example.org',
          displayName: 'Alice',
          membership: 'join',
        }),
        expect.objectContaining({
          userId: '@bob:example.org',
          displayName: 'Bob',
          membership: 'invite',
        }),
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),
];
