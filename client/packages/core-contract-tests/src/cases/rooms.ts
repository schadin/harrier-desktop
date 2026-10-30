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
];
