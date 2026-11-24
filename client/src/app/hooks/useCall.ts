import { createSnapshotStore, type CallView } from '@harrier/core';
import type { Room } from 'matrix-js-sdk';
import {
  MatrixRTCSessionEvent,
  type MatrixRTCSession,
  type MatrixRTCSessionEventHandlerMap,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import type { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useMatrixClient } from './useMatrixClient';
import { useCore } from './useCore';

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();

  const [session, setSession] = useState(mx.matrixRTC.getRoomSession(room));

  useEffect(() => {
    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
    };
  }, [mx, room]);

  return session;
};

export const useCallMembersChange = (
  session: MatrixRTCSession,
  callback: (members: CallMembership[]) => void
): void => {
  useEffect(() => {
    const handleMembershipsChange: MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.MembershipsChanged] =
      (oldestMembership, newMemberships) => {
        callback(newMemberships);
      };

    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    };
  }, [session, callback]);
};

export const useCallMembers = (session: MatrixRTCSession): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>(session.memberships);

  useCallMembersChange(session, setMemberships);

  return memberships;
};

const emptyCallStore = createSnapshotStore<CallView | null>(null);

export const useCoreCallSession = (roomId: string): CallView | null => {
  const core = useCore();
  const store = useMemo(() => core.calls?.session(roomId) ?? emptyCallStore, [core, roomId]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot).value;
};

export const useCoreCallMembers = (roomId: string) => {
  const session = useCoreCallSession(roomId);
  return session?.participants ?? [];
};
