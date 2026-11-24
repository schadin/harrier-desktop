import type { HarrierCore } from '@harrier/core';
import type { MatrixClient } from 'matrix-js-sdk';

const clients = new WeakMap<HarrierCore, MatrixClient>();

export function registerMatrixClient(core: HarrierCore, client: MatrixClient): void {
  clients.set(core, client);
}

export function getMatrixClient(core: HarrierCore): MatrixClient {
  const client = clients.get(core);
  if (!client) throw new Error('Matrix client is not registered for this core');
  return client;
}
