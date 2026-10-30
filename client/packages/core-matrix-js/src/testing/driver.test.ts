import { describe, expect, it } from 'vitest';
import { createSyncDriver } from './driver';

describe('matrix-js-sdk sync driver', () => {
  it('materializes joined rooms with their name state', async () => {
    const driver = createSyncDriver();
    await driver.applyFixture({
      rooms: [{ roomId: '!general:example.org', membership: 'join', name: 'General' }],
    });
    const room = driver.client.getRoom('!general:example.org');
    expect(room).not.toBeNull();
    expect(room?.name).toBe('General');
    expect(room?.getMyMembership()).toBe('join');
  });
});
