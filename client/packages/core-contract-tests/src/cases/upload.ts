import { expect } from 'vitest';
import { contractTest } from '../suite';

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

export const uploadCases = [
  contractTest('start uploads data and finishes with an mxc', async (harness) => {
    const core = await harness.create();
    try {
      const result = core.uploads.start({
        filename: 'hello.txt',
        contentType: 'text/plain',
        data: new TextEncoder().encode('hello').buffer,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const initial = core.uploads.status(result.value).getSnapshot().value;
      expect(initial).toMatchObject({
        localId: result.value,
        filename: 'hello.txt',
        status: 'uploading',
        total: 5,
      });
      await flush();
      const finished = core.uploads.status(result.value).getSnapshot().value;
      expect(finished).toMatchObject({
        status: 'done',
        loaded: 5,
        mxc: 'mxc://example.org/uploaded',
      });
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('cancel fails for an unknown upload', async (harness) => {
    const core = await harness.create();
    try {
      const result = await core.uploads.cancel('harrier-upload-unknown');
      expect(result.ok).toBe(false);
    } finally {
      await harness.dispose(core);
    }
  }),

  contractTest('status of an unknown upload is null', async (harness) => {
    const core = await harness.create();
    try {
      expect(core.uploads.status('harrier-upload-unknown').getSnapshot().value).toBeNull();
    } finally {
      await harness.dispose(core);
    }
  }),
];
