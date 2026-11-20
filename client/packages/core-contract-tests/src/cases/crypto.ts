import { expect } from 'vitest';
import { contractTest } from '../suite';

export const cryptoCases = [
  contractTest('device list is exposed as plain device views', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({
        rooms: [],
        devices: [
          {
            deviceId: 'DEVICE1',
            displayName: 'Desktop',
            lastSeenIp: '192.0.2.1',
            lastSeenTs: 1_700_000_000_000,
          },
        ],
      });
      const result = await core.crypto.refreshDevices();
      expect(result.ok).toBe(true);
      expect(core.crypto.devices.getSnapshot().value).toEqual([
        {
          deviceId: 'DEVICE1',
          displayName: 'Desktop',
          lastSeenIp: '192.0.2.1',
          lastSeenTs: 1_700_000_000_000,
          isCurrent: false,
          trust: 'unsupported',
        },
      ]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'device trust and unverified count are available without SDK types',
    async (harness) => {
      const core = await harness.create();
      try {
        const trust = core.crypto.trust('@alice:example.org', 'DEVICE1');
        expect(trust.getSnapshot().value).toBe('unknown');
        const count = core.crypto.unverifiedCount('@alice:example.org', ['DEVICE1']);
        expect(count.getSnapshot().value).toBe(0);
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('device rename and deletion go through core commands', async (harness) => {
    const core = await harness.create();
    try {
      await harness.applySyncFixture({ rooms: [], devices: [{ deviceId: 'DEVICE1' }] });
      const renamed = await core.crypto.renameDevice('DEVICE1', 'Renamed');
      expect(renamed.ok).toBe(true);
      const deleted = await core.crypto.deleteDevices(['DEVICE1']);
      expect(deleted.ok).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),
];
