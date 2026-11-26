import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { StateEvent } from '../../types/matrix/room';
import { useCore } from './useCore';

/** Race-free snapshot of the core stores that determine alias/tombstone navigation. */
export const useCoreRoomNavigationRevision = (): string => {
  const core = useCore();
  const getSnapshot = useCallback(() => {
    const allRooms = core.rooms.all.getSnapshot();
    const revisions = [allRooms.revision];
    allRooms.value.forEach(({ roomId }) => {
      revisions.push(
        core.rooms.room(roomId).getSnapshot().revision,
        core.rooms.stateEntry(roomId, StateEvent.RoomCanonicalAlias).getSnapshot().revision,
        core.rooms.stateEntry(roomId, StateEvent.RoomTombstone).getSnapshot().revision
      );
    });
    return revisions.join(':');
  }, [core]);

  const allRooms = useSyncExternalStore(
    core.rooms.all.subscribe,
    core.rooms.all.getSnapshot,
    core.rooms.all.getSnapshot
  );
  const roomIds = useMemo(() => allRooms.value.map(({ roomId }) => roomId), [allRooms]);
  const navigationStores = useMemo(
    () =>
      roomIds.flatMap((roomId) => [
        core.rooms.room(roomId),
        core.rooms.stateEntry(roomId, StateEvent.RoomCanonicalAlias),
        core.rooms.stateEntry(roomId, StateEvent.RoomTombstone),
      ]),
    [core, roomIds]
  );
  const subscribe = useCallback(
    (onChange: () => void) => {
      const unsubscribes = [
        core.rooms.all.subscribe(onChange),
        ...navigationStores.map((store) => store.subscribe(onChange)),
      ];
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    [core, navigationStores]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
