export { createMatrixJsCore, type MatrixJsCoreOptions } from './core';
export { createAuthOperations } from './auth';
export { getMatrixClient, registerMatrixClient } from './legacy';
export { CallWidgetDriver } from './call/CallWidgetDriver';
export { createMatrixJsClient } from './session';
export type { MatrixJsClientOptions, MatrixJsSession } from './session';
export { clearSecretStorageKeysForCore } from './secretStorageKeys';
export type { SecretStorageKeyStore } from './secretStorageKeys';
