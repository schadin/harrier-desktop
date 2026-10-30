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
];
