import type { RoomStateEntry } from '@harrier/core';
import { useEffect } from 'react';
import { useCore } from './useCore';

export type StateEventCallback = (
  entry: RoomStateEntry & { readonly roomId: string; readonly eventType: string }
) => void;

export const useStateEventCallback = (onStateEvent: StateEventCallback) => {
  const core = useCore();
  useEffect(() => core.rooms.onState(onStateEvent), [core, onStateEvent]);
};
