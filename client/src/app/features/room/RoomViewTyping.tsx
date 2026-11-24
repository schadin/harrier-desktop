import React from 'react';
import { Box, Icon, IconButton, Icons, Text, as } from 'folds';
import classNames from 'classnames';
import { useSetAtom } from 'jotai';
import { roomIdToTypingMembersAtom } from '../../state/typingMembers';
import { TypingIndicator } from '../../components/typing-indicator';
import { getMxIdLocalPart } from '../../utils/matrix';
import * as css from './RoomViewTyping.css';
import { useCoreSession } from '../../hooks/useCoreSession';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';

export type RoomViewTypingProps = {
  roomId: string;
};
export const RoomViewTyping = as<'div', RoomViewTypingProps>(
  ({ className, roomId, ...props }, ref) => {
    const setTypingMembers = useSetAtom(roomIdToTypingMembersAtom);
    const session = useCoreSession();
    const members = useRoomMembers(roomId);
    const typingMembers = useRoomTypingMember(roomId);

    const typingNames = typingMembers
      .filter((receipt) => receipt.userId !== session?.userId)
      .map((receipt) => {
        const rawDisplayName = members.find(
          (member) => member.userId === receipt.userId
        )?.rawDisplayName;
        return rawDisplayName !== undefined && rawDisplayName !== receipt.userId
          ? rawDisplayName
          : getMxIdLocalPart(receipt.userId);
      })
      .reverse();

    if (typingNames.length === 0) {
      return null;
    }

    const handleDropAll = () => {
      // some homeserver does not timeout typing status
      // we have given option so user can drop their typing status
      typingMembers.forEach((receipt) =>
        setTypingMembers({
          type: 'DELETE',
          roomId,
          userId: receipt.userId,
        })
      );
    };

    return (
      <div style={{ position: 'relative' }}>
        <Box
          className={classNames(css.RoomViewTyping, className)}
          alignItems="Center"
          gap="400"
          {...props}
          ref={ref}
        >
          <TypingIndicator />
          <Text className={css.TypingText} size="T300" truncate>
            {typingNames.length === 1 && (
              <>
                <b>{typingNames[0]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' is typing...'}
                </Text>
              </>
            )}
            {typingNames.length === 2 && (
              <>
                <b>{typingNames[0]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' and '}
                </Text>
                <b>{typingNames[1]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' are typing...'}
                </Text>
              </>
            )}
            {typingNames.length === 3 && (
              <>
                <b>{typingNames[0]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {', '}
                </Text>
                <b>{typingNames[1]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' and '}
                </Text>
                <b>{typingNames[2]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' are typing...'}
                </Text>
              </>
            )}
            {typingNames.length > 3 && (
              <>
                <b>{typingNames[0]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {', '}
                </Text>
                <b>{typingNames[1]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {', '}
                </Text>
                <b>{typingNames[2]}</b>
                <Text as="span" size="Inherit" priority="300">
                  {' and '}
                </Text>
                <b>{typingNames.length - 3} others</b>
                <Text as="span" size="Inherit" priority="300">
                  {' are typing...'}
                </Text>
              </>
            )}
          </Text>
          <IconButton title="Drop Typing Status" size="300" radii="Pill" onClick={handleDropAll}>
            <Icon size="50" src={Icons.Cross} />
          </IconButton>
        </Box>
      </div>
    );
  }
);
