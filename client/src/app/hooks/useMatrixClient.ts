import { getMatrixClient } from '@harrier/core-matrix-js';
import { useCore } from './useCore';

export function useMatrixClient(): ReturnType<typeof getMatrixClient> {
  return getMatrixClient(useCore());
}
