import { expect } from 'vitest';
import { contractTest } from '../suite';

export const authCases = [
  contractTest('auth metadata is exposed as a plain view', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.auth.refreshAuthMetadata();
      expect(result.ok).toBe(true);
      expect(core.auth.authMetadata.getSnapshot().value === null).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('capabilities are exposed as a plain view', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.auth.capabilities.getSnapshot().value).toEqual({});
      const refreshed = await core.auth.refreshCapabilities();
      expect(refreshed.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

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
