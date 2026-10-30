import { expect } from 'vitest';
import { contractTest } from '../suite';

export const authCases = [
  contractTest('logout clears the session and stops sync', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.session.getSnapshot().value?.userId).toBe('@tester:example.org');
      const result = await core.auth.logout();
      expect(result.ok).toBe(true);
      expect(core.auth.session.getSnapshot().value).toBeNull();
      expect(core.auth.sync.getSnapshot().value.phase).toBe('stopped');
    } finally {
      await harness.dispose(core);
    }
  }),
];
