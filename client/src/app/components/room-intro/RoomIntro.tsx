import React, { useCallback, useState } from 'react';
import { Avatar, Box, Button, Spinner, Text, as } from 'folds';
import type { CoreError } from '@harrier/core';
import { useAtomValue } from 'jotai';
import { IRoomCreateContent, Membership, StateEvent } from '../../../types/matrix/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { timeDayMonthYear, timeHourMinute } from '../../utils/time';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { RoomAvatar } from '../room-avatar';
import { nameInitials } from '../../utils/common';
import { useCoreRoomMeta } from '../../hooks/useCoreRoomMeta';
import { mDirectAtom } from '../../state/mDirectList';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { InviteUserPrompt } from '../invite-user-prompt';
import { useCore } from '../../hooks/useCore';
import { useCoreRoom } from '../../hooks/useCoreRoom';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { useStateEvent } from '../../hooks/useStateEvent';
import { joinRoom } from '../../utils/coreRoomActions';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';

export type RoomIntroProps = {
  room: { roomId: string };
};

export const RoomIntro = as<'div', RoomIntroProps>(({ room, ...props }, ref) => {
  const core = useCore();
  const { navigateRoom } = useRoomNavigate();
  const mDirects = useAtomValue(mDirectAtom);
  const [invitePrompt, setInvitePrompt] = useState(false);

  const createEvent = useStateEvent(room, StateEvent.RoomCreate);
  const members = useRoomMembers(room.roomId);
  const meta = useCoreRoomMeta(room.roomId);
  const dm = mDirects.has(room.roomId);
  const avatarMxc = dm ? meta.dmAvatarMxc : meta.avatarMxc;
  const { name } = meta;
  const { topic } = meta;
  const avatarRef = avatarMxc ? toMediaRef(avatarMxc) : undefined;
  const avatarHttpUrl = useMediaSource(avatarRef);

  const createContent = createEvent?.content as IRoomCreateContent | undefined;
  const ts = createEvent?.timestamp;
  const creatorId = createEvent?.sender;
  const creator = members.find((member) => member.userId === creatorId);
  const creatorName =
    creatorId &&
    ((creator?.rawDisplayName && creator.rawDisplayName !== creatorId
      ? creator.rawDisplayName
      : undefined) ??
      getMxIdLocalPart(creatorId));
  const prevRoomId = createContent?.predecessor?.room_id;
  const prevRoom = useCoreRoom(prevRoomId ?? '');

  const [prevRoomState, joinPrevRoom] = useAsyncCallback<void, CoreError, [string]>(
    useCallback(
      async (roomId) => {
        await joinRoom(core, roomId);
      },
      [core]
    )
  );

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');

  return (
    <Box direction="Column" grow="Yes" gap="500" {...props} ref={ref}>
      <Box>
        <Avatar size="500">
          <RoomAvatar
            roomId={room.roomId}
            src={avatarHttpUrl ?? undefined}
            alt={name}
            renderFallback={() => <Text size="H2">{nameInitials(name)}</Text>}
          />
        </Avatar>
      </Box>
      <Box direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="H3" priority="500">
            {name}
          </Text>
          <Text size="T400" priority="400">
            {typeof topic === 'string' ? topic : 'This is the beginning of conversation.'}
          </Text>
          {creatorName && ts && (
            <Text size="T200" priority="300">
              {'Created by '}
              <b>@{creatorName}</b>
              {` on ${timeDayMonthYear(ts)} ${timeHourMinute(ts, hour24Clock)}`}
            </Text>
          )}
        </Box>
        <Box gap="200" wrap="Wrap">
          <Button onClick={() => setInvitePrompt(true)} variant="Secondary" size="300" radii="300">
            <Text size="B300">Invite Member</Text>
          </Button>

          {invitePrompt && (
            <InviteUserPrompt roomId={room.roomId} requestClose={() => setInvitePrompt(false)} />
          )}
          {typeof prevRoomId === 'string' &&
            (prevRoom?.membership === Membership.Join ? (
              <Button
                onClick={() => navigateRoom(prevRoomId, createContent?.predecessor?.event_id)}
                variant="Success"
                size="300"
                fill="Soft"
                radii="300"
              >
                <Text size="B300">Open Old Room</Text>
              </Button>
            ) : (
              <Button
                onClick={() => joinPrevRoom(prevRoomId)}
                variant="Secondary"
                size="300"
                fill="Soft"
                radii="300"
                disabled={prevRoomState.status === AsyncStatus.Loading}
                after={
                  prevRoomState.status === AsyncStatus.Loading ? (
                    <Spinner size="50" variant="Secondary" fill="Soft" />
                  ) : undefined
                }
              >
                <Text size="B300">Join Old Room</Text>
              </Button>
            ))}
        </Box>
      </Box>
    </Box>
  );
});
