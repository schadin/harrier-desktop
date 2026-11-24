import type { HarrierCore } from '@harrier/core';
import type { MatrixClient } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import { getMatrixClient, registerMatrixClient } from './legacy';

describe('legacy client registry', () => {
  it('resolves the client from the core provider without a second React context', () => {
    const core = {} as HarrierCore;
    const client = {} as MatrixClient;
    registerMatrixClient(core, client);
    expect(getMatrixClient(core)).toBe(client);
  });
});
