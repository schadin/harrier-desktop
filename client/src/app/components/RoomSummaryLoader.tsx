import { ReactNode, useCallback, useState } from 'react';
import type { FederatedRoomSummaryView, PublicRoomView } from '@harrier/core';
import { useQuery } from '@tanstack/react-query';
import { useCore } from '../hooks/useCore';
import { useCoreRoom } from '../hooks/useCoreRoom';
import { useCoreRoomState } from '../hooks/useCoreRoomState';
import { useRoomMembers } from '../hooks/useRoomMembers';
import { AsyncState, AsyncStatus } from '../hooks/useAsyncCallback';
import { StateEvent } from '../../types/matrix/room';

type RoomSummaryLoaderProps = {
  roomIdOrAlias: string;
  children: (roomSummary?: FederatedRoomSummaryView) => ReactNode;
};
export function RoomSummaryLoader({ roomIdOrAlias, children }: RoomSummaryLoaderProps) {
  const core = useCore();

  const fetchSummary = useCallback(async () => {
    const result = await core.rooms.summary(roomIdOrAlias);
    if (!result.ok) throw result.error;
    return result.value;
  }, [core, roomIdOrAlias]);

  const { data } = useQuery({
    queryKey: [roomIdOrAlias, 'summary'],
    queryFn: fetchSummary,
  });

  return children(data);
}

export type LocalRoomSummary = {
  roomId: string;
  name: string;
  topic?: string;
  avatarMxc?: string;
  dmAvatarMxc?: string;
  canonicalAlias?: string;
  worldReadable?: boolean;
  guestCanJoin?: boolean;
  memberCount: number;
  roomType?: string;
  joinRule?: string;
};

export function LocalRoomSummaryLoader({
  roomId,
  children,
}: {
  roomId: string;
  children: (roomSummary: LocalRoomSummary) => ReactNode;
}) {
  const room = useCoreRoom(roomId);
  const members = useRoomMembers(roomId);
  const history = useCoreRoomState<{ history_visibility?: string }>(
    { roomId },
    StateEvent.RoomHistoryVisibility
  );
  const guestAccess = useCoreRoomState<{ guest_access?: string }>(
    { roomId },
    StateEvent.RoomGuestAccess
  );

  const summary: LocalRoomSummary = {
    roomId,
    name: room?.name ?? roomId,
    topic: room?.topic,
    avatarMxc: room?.avatarMxc,
    dmAvatarMxc: room?.dmAvatarMxc,
    canonicalAlias: room?.canonicalAlias,
    worldReadable:
      typeof history?.history_visibility === 'string'
        ? history.history_visibility === 'world_readable'
        : undefined,
    guestCanJoin:
      typeof guestAccess?.guest_access === 'string'
        ? guestAccess.guest_access === 'can_join'
        : undefined,
    memberCount: members.filter((member) => member.membership === 'join').length,
    roomType: room?.roomType,
    joinRule: room?.joinRule,
  };

  return children(summary);
}

export function HierarchyRoomSummaryLoader({
  roomId,
  children,
}: {
  roomId: string;
  children: (state: AsyncState<PublicRoomView, Error>) => ReactNode;
}) {
  const core = useCore();

  const fetchSummary = useCallback(async () => {
    const result = await core.rooms.hierarchy(roomId, { limit: 1 });
    if (!result.ok) throw result.error;
    return result.value;
  }, [core, roomId]);
  const [errorMemo, setError] = useState<Error>();

  const { data, error } = useQuery({
    queryKey: [roomId, `hierarchy`],
    queryFn: fetchSummary,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => {
      setError(err);
      if (failureCount > 3) return false;
      return true;
    },
  });

  let state: AsyncState<PublicRoomView, Error> = {
    status: AsyncStatus.Loading,
  };
  if (error) {
    state = {
      status: AsyncStatus.Error,
      error,
    };
  }
  if (errorMemo) {
    state = {
      status: AsyncStatus.Error,
      error: errorMemo,
    };
  }

  const summary = data?.rooms[0] ?? undefined;
  if (summary) {
    state = {
      status: AsyncStatus.Success,
      data: summary,
    };
  }

  return children(state);
}
