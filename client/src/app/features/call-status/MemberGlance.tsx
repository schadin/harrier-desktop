import { Box, config, Icon, Icons, Text } from 'folds';
import type { CallParticipantView, MemberView } from '@harrier/core';
import React from 'react';
import { UserAvatar } from '../../components/user-avatar';
import { getMxIdLocalPart } from '../../utils/matrix';
import { StackedAvatar } from '../../components/stacked-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';
import { useRoomMembers } from '../../hooks/useRoomMembers';
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
  roomId: string;
  members: readonly CallParticipantView[];
  speakers: Set<string>;
  max?: number;
};
export function MemberGlance({ roomId, members, speakers, max = 6 }: MemberGlanceProps) {
  const openUserProfile = useOpenUserRoomProfile();
  const roomMembers = useRoomMembers(roomId);
  const memberById = new Map<string, MemberView>(
    roomMembers.map((member) => [member.userId, member])
  );

  const visibleMembers = members.slice(0, max);
  const remainingCount = max && members.length > max ? members.length - max : 0;

  return (
    <Box alignItems="Center">
      {visibleMembers.map((callMember) => {
        const { userId } = callMember;
        if (!userId) return null;
        const member = memberById.get(userId);
        const name =
          member?.rawDisplayName !== undefined && member.rawDisplayName !== userId
            ? member.rawDisplayName
            : getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = member?.avatarMxc;

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
              openUserProfile(roomId, undefined, userId, getMouseEventCords(evt.nativeEvent), 'Top')
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
