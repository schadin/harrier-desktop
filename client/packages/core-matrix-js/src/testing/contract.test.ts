import {
  authCases,
  errorCases,
  notificationCases,
  presenceCases,
  receiptsTypingCases,
  uploadCases,
  cryptoCases,
  verificationCases,
  backupCases,
  mediaCases,
  callsCases,
  roomsCases,
  moderationCases,
  sendCases,
  runCoreContractSuite,
  timelineCases,
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
  failNextOperation(operation, failure) {
    if (!driver) throw new Error('create() must run before failNextOperation()');
    driver.failNextOperation(operation, failure);
  },
  setRoomSummaryResponse(roomIdOrAlias, response) {
    if (!driver) throw new Error('create() must run before setRoomSummaryResponse()');
    driver.setRoomSummaryResponse(roomIdOrAlias, response);
  },
  setThirdPartyProtocolsResponse(response) {
    if (!driver) throw new Error('create() must run before setThirdPartyProtocolsResponse()');
    driver.setThirdPartyProtocolsResponse(response);
  },
  getCalls() {
    if (!driver) throw new Error('create() must run before getCalls()');
    return driver.getCalls();
  },
  async dispose() {
    driver?.client.stopClient();
    driver = undefined;
  },
};

runCoreContractSuite(matrixJsHarness, [
  ...roomsCases,
  ...moderationCases,
  ...timelineCases,
  ...sendCases,
  ...presenceCases,
  ...receiptsTypingCases,
  ...uploadCases,
  ...cryptoCases,
  ...verificationCases,
  ...backupCases,
  ...mediaCases,
  ...callsCases,
  ...notificationCases,
  ...authCases,
  ...errorCases,
]);
