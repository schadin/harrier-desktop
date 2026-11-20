import { expect } from 'vitest';
import { contractTest } from '../suite';

export const verificationCases = [
  contractTest('verification lifecycle is accessible without crypto handles', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.crypto.verification.incoming.getSnapshot().value).toBeNull();
      expect(core.crypto.verification.view('unknown').getSnapshot().value).toBeNull();
      const requested = await core.crypto.verification.request('DEVICE1');
      expect(requested.ok).toBe(false);
      const accepted = await core.crypto.verification.accept('unknown');
      expect(accepted.ok).toBe(false);
      const cancelled = await core.crypto.verification.cancel('unknown');
      expect(cancelled.ok).toBe(false);
      const started = await core.crypto.verification.startSas('unknown');
      expect(started.ok).toBe(false);
      const confirmed = await core.crypto.verification.confirmSas('unknown');
      expect(confirmed.ok).toBe(false);
      const mismatched = await core.crypto.verification.mismatchSas('unknown');
      expect(mismatched.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),
];
