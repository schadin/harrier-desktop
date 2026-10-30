import {
  roomsCases,
  runCoreContractSuite,
  type CoreContractHarness,
} from '@harrier/core-contract-tests';
import { createMatrixJsCore } from '../core';
import { createSyncDriver, type SyncDriver } from './driver';

let driver: SyncDriver | undefined;

const matrixJsHarness: CoreContractHarness = {
  name: 'matrix-js',
  async create() {
    driver = createSyncDriver();
    return createMatrixJsCore(driver.client);
  },
  async applySyncFixture(fixture) {
    if (!driver) throw new Error('create() must run before applySyncFixture()');
    await driver.applyFixture(fixture);
  },
  async dispose() {
    driver?.client.stopClient();
    driver = undefined;
  },
};

runCoreContractSuite(matrixJsHarness, roomsCases);
