import type { MemberView } from '@harrier/core';
import React from 'react';
import { Box, Icon, Icons, Text } from 'folds';
import { getMxIdLocalPart } from '../../utils/matrix';
import { useRoomMembers } from '../../hooks/useRoomMembers';

type MemberSpeakingProps = {
  roomId: string;
  speakers: Set<string>;
};
export function MemberSpeaking({ roomId, speakers }: MemberSpeakingProps) {
  const roomMembers = useRoomMembers(roomId);
  const memberById = new Map<string, MemberView>(
    roomMembers.map((member) => [member.userId, member])
  );
  const speakingNames = Array.from(speakers).map((userId) => {
    const member = memberById.get(userId);
    return member?.rawDisplayName !== undefined && member.rawDisplayName !== userId
      ? member.rawDisplayName
      : getMxIdLocalPart(userId) ?? userId;
  });
  return (
    <Box alignItems="Center" gap="100">
      <Icon size="100" src={Icons.Mic} filled />
      <Text size="T200" truncate>
        {speakingNames.length === 1 && (
          <>
            <b>{speakingNames[0]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' is speaking...'}
            </Text>
          </>
        )}
        {speakingNames.length === 2 && (
          <>
            <b>{speakingNames[0]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' and '}
            </Text>
            <b>{speakingNames[1]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' are speaking...'}
            </Text>
          </>
        )}
        {speakingNames.length === 3 && (
          <>
            <b>{speakingNames[0]}</b>
            <Text as="span" size="Inherit" priority="300">
              {', '}
            </Text>
            <b>{speakingNames[1]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' and '}
            </Text>
            <b>{speakingNames[2]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' are speaking...'}
            </Text>
          </>
        )}
        {speakingNames.length > 3 && (
          <>
            <b>{speakingNames[0]}</b>
            <Text as="span" size="Inherit" priority="300">
              {', '}
            </Text>
            <b>{speakingNames[1]}</b>
            <Text as="span" size="Inherit" priority="300">
              {', '}
            </Text>
            <b>{speakingNames[2]}</b>
            <Text as="span" size="Inherit" priority="300">
              {' and '}
            </Text>
            <b>{speakingNames.length - 3} others</b>
            <Text as="span" size="Inherit" priority="300">
              {' are speaking...'}
            </Text>
          </>
        )}
      </Text>
    </Box>
  );
}
