import React, { MouseEventHandler, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Chip,
  config,
  Icon,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Text,
  toRem,
} from 'folds';
import type { CallParticipantView } from '@harrier/core';
import FocusTrap from 'focus-trap-react';
import { Room } from 'matrix-js-sdk';
import * as css from './styles.css';
import { stopPropagation } from '../../utils/keyboard';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';

type LiveMemberAvatarProps = {
  userId: string;
  avatarMxc: string | undefined;
  name: string;
};

function LiveMemberAvatar({ userId, avatarMxc, name }: LiveMemberAvatarProps) {
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

type LiveChipProps = {
  room: Room;
  members: readonly CallParticipantView[];
  count: number;
};
export function LiveChip({ count, room, members }: LiveChipProps) {
  const openUserProfile = useOpenUserRoomProfile();

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={cords}
      position="Top"
      align="Start"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            style={{
              maxHeight: '75vh',
              maxWidth: toRem(300),
              display: 'flex',
            }}
          >
            <Box grow="Yes">
              <Scroll size="0" hideTrack visibility="Hover">
                <Box direction="Column" style={{ padding: config.space.S100 }}>
                  {members.map((callMember) => {
                    const { userId } = callMember;
                    if (!userId) return null;
                    const name =
                      getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
                    const avatarMxc = getMemberAvatarMxc(room, userId);

                    return (
                      <MenuItem
                        key={callMember.memberId}
                        size="400"
                        variant="Surface"
                        radii="300"
                        style={{ paddingLeft: config.space.S200 }}
                        onClick={(evt: React.MouseEvent<HTMLElement>) =>
                          openUserProfile(
                            room.roomId,
                            undefined,
                            userId,
                            getMouseEventCords(evt.nativeEvent),
                            'Right'
                          )
                        }
                        before={
                          <Avatar size="200" radii="400">
                            <LiveMemberAvatar userId={userId} avatarMxc={avatarMxc} name={name} />
                          </Avatar>
                        }
                      >
                        <Text size="T300" truncate>
                          {name}
                        </Text>
                      </MenuItem>
                    );
                  })}
                </Box>
              </Scroll>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant="Surface"
        fill="Soft"
        before={<Badge variant="Critical" fill="Solid" size="200" />}
        after={<Icon size="50" src={cords ? Icons.ChevronBottom : Icons.ChevronTop} />}
        radii="Pill"
        onClick={handleOpenMenu}
      >
        <Text className={css.LiveChipText} as="span" size="L400" truncate>
          {count} Live
        </Text>
      </Chip>
    </PopOut>
  );
}
