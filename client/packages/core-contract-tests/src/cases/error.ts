import { expect } from 'vitest';
import { contractTest } from '../suite';

export const errorCases = [
  contractTest('one-shot command failures preserve normalized error metadata', async (harness) => {
    const core = await harness.create();
    const roomId = '!errors:example.org';
    try {
      await harness.applySyncFixture({
        rooms: [{ roomId, membership: 'join', name: 'Errors' }],
      });
      harness.failNextOperation('/state/m.room.topic', {
        operation: '/state/m.room.topic',
        httpStatus: 429,
        errcode: 'M_LIMIT_EXCEEDED',
        error: 'Slow down',
        retryAfterMs: 1250,
        data: { retry_after_ms: 1250, context: { source: 'contract' } },
      });

      const failed = await core.rooms.sendState(roomId, 'm.room.topic', { topic: 'First' });
      expect(failed.ok).toBe(false);
      if (!failed.ok) {
        expect(failed.error).toMatchObject({
          code: 'rate-limited',
          retryable: true,
          httpStatus: 429,
          errcode: 'M_LIMIT_EXCEEDED',
          retryAfterMs: 1250,
          data: {
            errcode: 'M_LIMIT_EXCEEDED',
            error: 'Slow down',
            retry_after_ms: 1250,
            context: { source: 'contract' },
          },
        });
        expect('cause' in failed.error).toBe(false);
      }

      const retried = await core.rooms.sendState(roomId, 'm.room.topic', { topic: 'Second' });
      expect(retried.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),
];
