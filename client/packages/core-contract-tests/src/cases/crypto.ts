import { expect } from 'vitest';
import { contractTest } from '../suite';

export const cryptoCases = [
  contractTest('crypto capability matches the driver', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.capabilities.crypto).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'crypto commands return non-retryable unsupported without crypto',
    async (harness) => {
      const core = await harness.create({ crypto: false });
      try {
        expect(core.capabilities.crypto).toBe(false);
        const results = [
          await core.crypto.exportRoomKeys(),
          await core.crypto.importRoomKeys('{"rooms":{}}'),
          await core.crypto.backup.reset(),
        ];
        results.forEach((result) => {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toMatchObject({
              code: 'unsupported',
              message: 'Crypto is not available',
              retryable: false,
            });
            expect(result.error.httpStatus).toBeUndefined();
            expect(result.error.errcode).toBeUndefined();
            expect(result.error.data).toBeUndefined();
          }
        });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('room key export preserves the JSON string exactly', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.crypto.exportRoomKeys();
      expect(result).toEqual({
        ok: true,
        value:
          '{\n  "algorithm": "m.megolm.v1.aes-sha2",\n  "note": "ключ 🔐",\n  "rooms": {}\n}\n',
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest(
    'room key import forwards JSON and consumes one normalized failure',
    async (harness) => {
      const core = await harness.create();
      const keysJson = ' {\n  "rooms": { "!room:example.org": {} },\n  "note": "ключ 🔐"\n} ';
      try {
        harness.failNextOperation('crypto.importRoomKeys', {
          operation: 'crypto.importRoomKeys',
          httpStatus: 400,
          errcode: 'M_INVALID_PARAM',
          error: 'Invalid room keys',
          data: { detail: 'bad-json' },
        });
        const failed = await core.crypto.importRoomKeys(keysJson);
        expect(failed.ok).toBe(false);
        if (!failed.ok) {
          expect(failed.error).toMatchObject({
            code: 'invalid-request',
            httpStatus: 400,
            errcode: 'M_INVALID_PARAM',
            retryable: false,
            data: { detail: 'bad-json', errcode: 'M_INVALID_PARAM', error: 'Invalid room keys' },
          });
          expect(failed.error).not.toHaveProperty('cause');
        }
        expect(await core.crypto.importRoomKeys(keysJson)).toEqual({ ok: true, value: undefined });
      } finally {
        await harness.dispose(core);
      }
    }
  ),

  contractTest('message search is exposed as plain views', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.rooms.searchMessages({ term: 'hello', order: 'recent' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.groups).toEqual([]);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('via servers are exposed as plain strings', async (harness) => {
    const core = await harness.create();
    try {
      expect(Array.isArray(core.rooms.viaServers('!unknown:example.org'))).toBe(true);
    } finally {
      await harness.dispose(core);
    }
  }),

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
          trust: 'unverified',
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
