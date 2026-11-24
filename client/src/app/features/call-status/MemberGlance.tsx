import { Box, config, Icon, Icons, Text } from 'folds';
import type { CallParticipantView } from '@harrier/core';
import React from 'react';
import { Room } from 'matrix-js-sdk';
import { UserAvatar } from '../../components/user-avatar';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { StackedAvatar } from '../../components/stacked-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';
import * as css from './styles.css';

type GlanceMemberAvatarProps = {
  userId: string;
  avatarMxc: string | undefined;
  name: string;
};

function GlanceMemberAvatar({ userId, avatarMxc, name }: GlanceMemberAvatarProps) {
  const avatarUrl = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 96, height: 96 }) : undefined
  );

  return (
    <UserAvatar
      userId={userId}
      src={avatarUrl}
      alt={name}
      renderFallback={() => <Icon size="50" src={Icons.User} filled />}
    />
  );
}

type MemberGlanceProps = {
  room: Room;
  members: readonly CallParticipantView[];
  speakers: Set<string>;
  max?: number;
};
export function MemberGlance({ room, members, speakers, max = 6 }: MemberGlanceProps) {
  const openUserProfile = useOpenUserRoomProfile();

  const visibleMembers = members.slice(0, max);
  const remainingCount = max && members.length > max ? members.length - max : 0;

  return (
    <Box alignItems="Center">
      {visibleMembers.map((callMember) => {
        const { userId } = callMember;
        if (!userId) return null;
        const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = getMemberAvatarMxc(room, userId);

        return (
          <StackedAvatar
            key={callMember.memberId ?? `${callMember.userId}:${callMember.deviceId ?? ''}`}
            className={speakers.has(callMember.userId) ? css.SpeakerAvatarOutline : undefined}
            title={name}
            as="button"
            variant="Background"
            size="200"
            radii="Pill"
            onClick={(evt: React.MouseEvent<HTMLElement>) =>
              openUserProfile(
                room.roomId,
                undefined,
                userId,
                getMouseEventCords(evt.nativeEvent),
                'Top'
              )
            }
          >
            <GlanceMemberAvatar userId={userId} avatarMxc={avatarMxc} name={name} />
          </StackedAvatar>
        );
      })}
      {remainingCount > 0 && (
        <Text size="L400" style={{ paddingLeft: config.space.S100 }}>
          +{remainingCount}
        </Text>
      )}
    </Box>
  );
}
