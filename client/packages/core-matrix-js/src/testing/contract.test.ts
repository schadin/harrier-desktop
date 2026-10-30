import {
  roomsCases,
  runCoreContractSuite,
  type CoreContractHarness,
} from '@harrier/core-contract-tests';

const pendingHarness: CoreContractHarness = {
  name: 'matrix-js',
  async create() {
    throw new Error('createMatrixJsCore is not implemented yet');
  },
  async applySyncFixture() {
    throw new Error('createMatrixJsCore is not implemented yet');
  },
  async dispose() {
    return undefined;
  },
};

runCoreContractSuite(pendingHarness, roomsCases);
