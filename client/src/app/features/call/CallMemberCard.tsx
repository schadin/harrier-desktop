import type { CallParticipantView } from '@harrier/core';
import React, { useState } from 'react';
import { Avatar, Box, Icon, Icons, Text } from 'folds';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { SequenceCard } from '../../components/sequence-card';
import { useRequiredCoreRoomFromContext, useRoomId } from '../../hooks/useRoom';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { getMxIdLocalPart } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { getMouseEventCords } from '../../utils/dom';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';
import * as css from './styles.css';

type CallMemberCardProps = {
  member: CallParticipantView;
};
export function CallMemberCard({ member }: CallMemberCardProps) {
  const roomId = useRoomId();
  useRequiredCoreRoomFromContext();
  const members = useRoomMembers(roomId);

  const openUserProfile = useOpenUserRoomProfile();

  const { userId } = member;
  const roomMember = userId ? members.find((candidate) => candidate.userId === userId) : undefined;
  const avatarMxc = roomMember?.avatarMxc;
  const avatarUrl = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 96, height: 96 }) : undefined
  );
  if (!userId) return null;

  const displayName = roomMember?.rawDisplayName;
  const name =
    (displayName === userId ? undefined : displayName) ?? getMxIdLocalPart(userId) ?? userId;

  const audioOnly = member.callIntent === 'audio';

  return (
    <SequenceCard
      as="button"
      key={member.memberId ?? `${member.userId}:${member.deviceId ?? ''}`}
      className={css.CallMemberCard}
      variant="SurfaceVariant"
      radii="500"
      onClick={(evt: any) =>
        openUserProfile(roomId, undefined, userId, getMouseEventCords(evt.nativeEvent), 'Right')
      }
    >
      <Box grow="Yes" gap="300" alignItems="Center">
        <Avatar size="200" radii="400">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            alt={name}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
        <Box grow="Yes">
          <Text size="L400" truncate>
            {name}
          </Text>
        </Box>
        {audioOnly && <Icon src={Icons.VideoCameraMute} size="100" />}
      </Box>
    </SequenceCard>
  );
}

export function CallMemberRenderer({
  members,
  max = 4,
}: {
  members: readonly CallParticipantView[];
  max?: number;
}) {
  const [viewMore, setViewMore] = useState(false);

  const truncatedMembers = viewMore ? members : members.slice(0, 4);
  const remaining = members.length - truncatedMembers.length;

  return (
    <>
      {truncatedMembers.map((member) => (
        <CallMemberCard
          key={member.memberId ?? `${member.userId}:${member.deviceId ?? ''}`}
          member={member}
        />
      ))}
      {members.length > max && (
        <SequenceCard
          as="button"
          className={css.CallMemberCard}
          variant="SurfaceVariant"
          radii="500"
          onClick={() => setViewMore(!viewMore)}
        >
          <Box grow="Yes" gap="300" alignItems="Center">
            {viewMore ? (
              <Text size="L400" truncate>
                Collapse
              </Text>
            ) : (
              <Text size="L400" truncate>
                {remaining === 0 ? `+${remaining} Other` : `+${remaining} Others`}
              </Text>
            )}
          </Box>
          <Icon src={viewMore ? Icons.ChevronTop : Icons.ChevronBottom} size="100" />
        </SequenceCard>
      )}
    </>
  );
}
