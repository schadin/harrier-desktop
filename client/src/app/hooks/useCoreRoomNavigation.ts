import { useCallback, useRef, useSyncExternalStore } from 'react';
import { StateEvent } from '../../types/matrix/room';
import { useCore } from './useCore';

/** Re-renders alias/tombstone consumers after core publishes the corresponding room state. */
export const useCoreRoomNavigationRevision = (): number => {
  const core = useCore();
  const revision = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) =>
      core.rooms.onState((entry) => {
        if (
          entry.eventType !== StateEvent.RoomCanonicalAlias &&
          entry.eventType !== StateEvent.RoomTombstone
        ) {
          return;
        }
        revision.current += 1;
        onChange();
      }),
    [core]
  );
  const getSnapshot = useCallback(() => revision.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
