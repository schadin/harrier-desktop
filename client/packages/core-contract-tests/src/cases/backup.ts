import { expect } from 'vitest';
import { contractTest } from '../suite';

export const backupCases = [
  contractTest('backup reset refreshes status after a successful reset', async (harness) => {
    const core = await harness.create();
    try {
      expect((await core.crypto.backup.refreshStatus()).ok).toBe(true);
      const initial = core.crypto.backup.status.getSnapshot().value;
      expect(initial).toMatchObject({ enabled: false, infoAbsent: true, sessionsRemaining: 0 });

      expect(await core.crypto.backup.reset()).toEqual({ ok: true, value: undefined });
      expect(core.crypto.backup.status.getSnapshot().value).toMatchObject({
        enabled: true,
        version: '2',
        count: 0,
        infoAbsent: false,
        sessionsRemaining: 0,
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'backup reset normalizes failure without publishing refreshed status',
    async (harness) => {
      const core = await harness.create();
      try {
        expect((await core.crypto.backup.refreshStatus()).ok).toBe(true);
        const initial = core.crypto.backup.status.getSnapshot();
        harness.failNextOperation('crypto.backup.reset', {
          operation: 'crypto.backup.reset',
          httpStatus: 403,
          errcode: 'M_FORBIDDEN',
          error: 'Reset denied',
        });

        const result = await core.crypto.backup.reset();
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatchObject({
            code: 'forbidden',
            httpStatus: 403,
            errcode: 'M_FORBIDDEN',
            retryable: false,
          });
        }
        expect(core.crypto.backup.status.getSnapshot()).toBe(initial);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest(
    'backup reset surfaces a status refresh failure after reset succeeds',
    async (harness) => {
      const core = await harness.create();
      try {
        expect((await core.crypto.backup.refreshStatus()).ok).toBe(true);
        harness.failNextOperation('crypto.backup.refreshStatus', {
          operation: 'crypto.backup.refreshStatus',
          httpStatus: 500,
          errcode: 'M_UNKNOWN',
          error: 'Status unavailable',
        });

        const result = await core.crypto.backup.reset();
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatchObject({
            code: 'unknown',
            httpStatus: 500,
            retryable: true,
          });
        }
      } finally {
        await harness.dispose(core);
      }
    }
  ),

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
      expect(restored.ok).toBe(true);
      expect(core.crypto.backup.progress.getSnapshot().value).toEqual({ status: 'done' });
      const decoded = await core.crypto.backup.decodeRecoveryKey('missing', {
        recoveryKey: 'not a key',
      });
      expect(decoded.ok).toBe(false);
      const unlocked = await core.crypto.backup.unlockSecretStorage();
      expect(unlocked.ok).toBe(true);
      const keyRequest = await core.crypto.backup.requestKey('!room:example.org', '$unknown');
      expect(keyRequest.ok).toBe(false);
      const retried = await core.crypto.backup.retryDecryption();
      expect(retried.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),
];
