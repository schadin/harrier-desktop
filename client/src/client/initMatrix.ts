import type { HarrierCore } from '@harrier/core';
import { createMatrixJsClient, createMatrixJsCore } from '@harrier/core-matrix-js';

import { cryptoCallbacks, loadSecretStorageKeys } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { pushSessionToSW } from '../sw-session';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

export const initClient = async (session: Session) => {
  await loadSecretStorageKeys();
  const client = await createMatrixJsClient(session, { cryptoCallbacks });
  return createMatrixJsCore(client);
};

export const clearCacheAndReload = async (core: HarrierCore) => {
  const userId = core.auth.session.getSnapshot().value?.userId;
  await core.auth.clearCache();
  if (userId) clearNavToActivePathStore(userId);
  window.location.reload();
};

export const logoutClient = async (core: HarrierCore) => {
  pushSessionToSW();
  await core.auth.logout();
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};
