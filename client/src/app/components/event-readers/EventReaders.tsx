import React from 'react';
import classNames from 'classnames';
import {
  Avatar,
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  MenuItem,
  Scroll,
  Text,
  as,
  config,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import { useRoomEventReaders } from '../../hooks/useRoomEventReaders';
import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import * as css from './EventReaders.css';
import { UserAvatar } from '../user-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { getMouseEventCords } from '../../utils/dom';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';

type EventReaderAvatarProps = {
  userId: string;
  avatarMxc: string | undefined;
  name: string;
};

function EventReaderAvatar({ userId, avatarMxc, name }: EventReaderAvatarProps) {
  const avatarUrl = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 100, height: 100, resizeMethod: 'crop' }) : undefined
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

export type EventReadersProps = {
  room: Room;
  eventId: string;
  requestClose: () => void;
};
export const EventReaders = as<'div', EventReadersProps>(
  ({ className, room, eventId, requestClose, ...props }, ref) => {
    const latestEventReaders = useRoomEventReaders(room.roomId, eventId);
    const openProfile = useOpenUserRoomProfile();
    const space = useSpaceOptionally();

    const getName = (userId: string) =>
      getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;

    return (
      <Box
        className={classNames(css.EventReaders, className)}
        direction="Column"
        {...props}
        ref={ref}
      >
        <Header className={css.Header} variant="Surface" size="600">
          <Box grow="Yes">
            <Text size="H3">Seen by</Text>
          </Box>
          <IconButton size="300" onClick={requestClose}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box grow="Yes">
          <Scroll visibility="Hover" hideTrack size="300">
            <Box className={css.Content} direction="Column">
              {latestEventReaders.map((readerId) => {
                const name = getName(readerId);
                const avatarMxcUrl = room.getMember(readerId)?.getMxcAvatarUrl();

                return (
                  <MenuItem
                    key={readerId}
                    style={{ padding: `0 ${config.space.S200}` }}
                    radii="400"
                    onClick={(event: React.MouseEvent<HTMLElement>) => {
                      openProfile(
                        room.roomId,
                        space?.roomId,
                        readerId,
                        getMouseEventCords(event.nativeEvent),
                        'Bottom'
                      );
                    }}
                    before={
                      <Avatar size="200">
                        <EventReaderAvatar userId={readerId} avatarMxc={avatarMxcUrl} name={name} />
                      </Avatar>
                    }
                  >
                    <Text size="T400" truncate>
                      {name}
                    </Text>
                  </MenuItem>
                );
              })}
            </Box>
          </Scroll>
        </Box>
      </Box>
    );
  }
);
