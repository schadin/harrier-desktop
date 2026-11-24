import type { MatrixClient } from 'matrix-js-sdk';
import { getMatrixClient } from '@harrier/core-matrix-js';
import { useCore } from './useCore';

export function useMatrixClient(): MatrixClient {
  return getMatrixClient(useCore());
}
