import { expect } from 'vitest';
import { contractTest } from '../suite';

export const verificationCases = [
  contractTest('verification lifecycle is available through the contract', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.crypto.verification.incoming.getSnapshot().value).toBeNull();
      expect(core.crypto.verification.view('unknown').getSnapshot().value).toBeNull();
      const requested = await core.crypto.verification.request('DEVICE1');
      expect(requested.ok).toBe(true);
      if (!requested.ok) return;
      const { id } = requested.value;
      expect(core.crypto.verification.view(id).getSnapshot().value?.phase).toBe('requested');
      expect((await core.crypto.verification.accept(id)).ok).toBe(true);
      expect(core.crypto.verification.view(id).getSnapshot().value?.phase).toBe('ready');
      expect((await core.crypto.verification.startSas(id)).ok).toBe(true);
      expect(core.crypto.verification.view(id).getSnapshot().value?.phase).toBe('started');
      expect(core.crypto.verification.view(id).getSnapshot().value?.sas?.emoji).toEqual([
        { emoji: '🐱', name: 'Cat' },
      ]);
      expect((await core.crypto.verification.confirmSas(id)).ok).toBe(true);
      expect((await core.crypto.verification.cancel(id)).ok).toBe(true);
      expect(core.crypto.verification.view(id).getSnapshot().value?.phase).toBe('cancelled');
    } finally {
      await harness.dispose(core);
    }
  }),
];
