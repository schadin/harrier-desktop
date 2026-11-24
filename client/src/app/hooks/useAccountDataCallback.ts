import type { JsonObject } from '@harrier/core';
import { useEffect } from 'react';
import { useCore } from './useCore';

export const useAccountDataCallback = (
  onAccountData: (type: string, content: JsonObject) => void
) => {
  const core = useCore();
  useEffect(() => core.auth.onAccountData(onAccountData), [core, onAccountData]);
};
