import type { HarrierCore } from '@harrier/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver } from './testing/driver';

const roomId = '!moderation:example.org';
const userId = '@target:example.org';
const eventId = '$report:example.org';

const commandCases = [
  {
    name: 'kick',
    sdkMethod: 'kick',
    args: [roomId, userId, '  Keep this reason  '],
    run: (core: HarrierCore) => core.rooms.kick(roomId, userId, '  Keep this reason  '),
  },
  {
    name: 'kick without a reason',
    sdkMethod: 'kick',
    args: [roomId, userId, undefined],
    run: (core: HarrierCore) => core.rooms.kick(roomId, userId),
  },
  {
    name: 'ban',
    sdkMethod: 'ban',
    args: [roomId, userId, 'Spam'],
    run: (core: HarrierCore) => core.rooms.ban(roomId, userId, 'Spam'),
  },
  {
    name: 'ban without a reason',
    sdkMethod: 'ban',
    args: [roomId, userId, undefined],
    run: (core: HarrierCore) => core.rooms.ban(roomId, userId),
  },
  {
    name: 'unban',
    sdkMethod: 'unban',
    args: [roomId, userId],
    run: (core: HarrierCore) => core.rooms.unban(roomId, userId),
  },
  {
    name: 'reportEvent',
    sdkMethod: 'reportEvent',
    args: [roomId, eventId, -100, 'Abuse'],
    run: (core: HarrierCore) => core.rooms.reportEvent(roomId, eventId, -100, 'Abuse'),
  },
  {
    name: 'reportRoom',
    sdkMethod: 'reportRoom',
    args: [roomId, 'Spam'],
    run: (core: HarrierCore) => core.rooms.reportRoom(roomId, 'Spam'),
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('matrix-js moderation adapter', () => {
  it.each(commandCases)('$name delegates once with exact SDK arguments', async (command) => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const sdkSpy = vi.spyOn(driver.client, command.sdkMethod).mockResolvedValue({} as never);
    try {
      expect(await command.run(core)).toEqual({ ok: true, value: undefined });
      expect(sdkSpy).toHaveBeenCalledTimes(1);
      expect(sdkSpy.mock.calls[0]).toEqual(command.args);
    } finally {
      await core.auth.stop();
    }
  });
});
