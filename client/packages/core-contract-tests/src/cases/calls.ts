import { expect } from 'vitest';
import { contractTest } from '../suite';

export const callsCases = [
  contractTest('optional calls capability exposes active calls and commands', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.capabilities.calls).toBe(true);
      expect(core.calls?.active.getSnapshot().value).toEqual([]);
      expect(core.calls?.session('!unknown:example.org').getSnapshot().value).toBeNull();
      const joined = await core.calls?.join('!room:example.org');
      expect(joined?.ok).toBe(true);
      expect(core.calls?.active.getSnapshot().value).toEqual([
        {
          roomId: '!room:example.org',
          participants: [{ userId: '@tester:example.org' }],
        },
      ]);
      const left = await core.calls?.leave('!room:example.org');
      expect(left?.ok).toBe(true);
      expect(core.calls?.active.getSnapshot().value).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),
];
