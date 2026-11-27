import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileSaver from 'file-saver';
import { CoreError, type HarrierCore } from '@harrier/core';
import { decryptMegolmKeyFile, encryptMegolmKeyFile } from '../../../../util/cryptE2ERoomKeys';
import { exportLocalRoomKeys, importLocalRoomKeys } from './localBackup';

vi.mock('file-saver', () => ({ default: { saveAs: vi.fn() } }));
vi.mock('../../../../util/cryptE2ERoomKeys', () => ({
  encryptMegolmKeyFile: vi.fn(),
  decryptMegolmKeyFile: vi.fn(),
}));

const coreWithCrypto = (crypto: Partial<HarrierCore['crypto']>): HarrierCore =>
  ({ crypto } as unknown as HarrierCore);

describe('local room-key backup helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports exact JSON through core and preserves encrypted file download UX', async () => {
    const keysJson = ' {\n  "note": "ключ 🔐",\n  "rooms": {}\n}\n';
    const encrypted = new TextEncoder().encode('encrypted-key-file').buffer;
    const exportRoomKeys = vi.fn(async () => ({ ok: true as const, value: keysJson }));
    vi.mocked(encryptMegolmKeyFile).mockResolvedValue(encrypted);

    await exportLocalRoomKeys(coreWithCrypto({ exportRoomKeys }), 'private password');

    expect(exportRoomKeys).toHaveBeenCalledTimes(1);
    expect(encryptMegolmKeyFile).toHaveBeenCalledWith(keysJson, 'private password');
    expect(FileSaver.saveAs).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(FileSaver.saveAs).mock.calls[0]!;
    expect(filename).toBe('harrier-keys.txt');
    if (!(blob instanceof Blob)) throw new Error('Expected a Blob');
    expect(blob.type).toBe('text/plain;charset=us-ascii');
    expect(await blob.text()).toBe('encrypted-key-file');
  });

  it('decrypts the selected file and forwards exact JSON through core', async () => {
    const keysJson = '{\n  "rooms": { "!room:example.org": {} }\n}';
    const bytes = new Uint8Array([1, 2, 3]);
    const file = { arrayBuffer: vi.fn(async () => bytes.buffer) };
    const importRoomKeys = vi.fn(async () => ({ ok: true as const, value: undefined }));
    vi.mocked(decryptMegolmKeyFile).mockResolvedValue(keysJson);

    await importLocalRoomKeys(coreWithCrypto({ importRoomKeys }), file, 'private password');

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(decryptMegolmKeyFile).toHaveBeenCalledWith(bytes.buffer, 'private password');
    expect(importRoomKeys).toHaveBeenCalledWith(keysJson);
  });

  it('surfaces the same CoreError without saving a failed export', async () => {
    const error = new CoreError('unsupported', 'Crypto is not available', false);
    const exportRoomKeys = vi.fn(async () => ({ ok: false as const, error }));

    await expect(
      exportLocalRoomKeys(coreWithCrypto({ exportRoomKeys }), 'private password')
    ).rejects.toBe(error);
    expect(encryptMegolmKeyFile).not.toHaveBeenCalled();
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('surfaces a core import failure without reporting success', async () => {
    const error = new CoreError('invalid-request', 'Invalid room keys', false);
    const importRoomKeys = vi.fn(async () => ({ ok: false as const, error }));
    vi.mocked(decryptMegolmKeyFile).mockResolvedValue('{"rooms":{}}');

    await expect(
      importLocalRoomKeys(
        coreWithCrypto({ importRoomKeys }),
        { arrayBuffer: async () => new ArrayBuffer(0) },
        'private password'
      )
    ).rejects.toBe(error);
  });
});
