import { expect } from 'vitest';
import { contractTest } from '../suite';

export const backupCases = [
  contractTest('backup status is exposed as plain view without crypto handles', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.crypto.backup.status.getSnapshot().value).toMatchObject({
        enabled: false,
        sessionsRemaining: 0,
      });
      expect(core.crypto.backup.progress.getSnapshot().value).toEqual({ status: 'idle' });
      const refreshed = await core.crypto.backup.refreshStatus();
      expect(refreshed.ok).toBe(true);
      const restored = await core.crypto.backup.restore();
      expect(restored.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),
];
