import React, { useState } from 'react';
import classNames from 'classnames';
import {
  Avatar,
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  MenuItem,
  Scroll,
  Text,
  as,
  config,
} from 'folds';
import type { ReactionCountView } from '@harrier/core';
import { useRoomMembers } from '../../../hooks/useRoomMembers';
import { getMxIdLocalPart } from '../../../utils/matrix';
import * as css from './ReactionViewer.css';
import { Reaction } from '../../../components/message';
import { getHexcodeForEmoji, getShortcodeFor } from '../../../plugins/emoji';
import { UserAvatar } from '../../../components/user-avatar';
import { useOpenUserRoomProfile } from '../../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../../hooks/useSpace';
import { getMouseEventCords } from '../../../utils/dom';
import { toMediaRef, useMediaSource } from '../../../utils/coreMedia';

type ReactionSenderAvatarProps = {
  userId: string;
  avatarMxc: string | undefined;
  name: string;
};

function ReactionSenderAvatar({ userId, avatarMxc, name }: ReactionSenderAvatarProps) {
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

export type ReactionViewerProps = {
  roomId: string;
  initialKey?: string;
  reactions: readonly ReactionCountView[];
  requestClose: () => void;
};
export const ReactionViewer = as<'div', ReactionViewerProps>(
  ({ className, roomId, initialKey, reactions, requestClose, ...props }, ref) => {
    const members = useRoomMembers(roomId);
    const space = useSpaceOptionally();
    const openProfile = useOpenUserRoomProfile();

    const [selectedKey, setSelectedKey] = useState<string>(() => {
      if (initialKey) return initialKey;
      return reactions[0]?.key ?? '';
    });

    const selectedSummary = reactions.find((reaction) => reaction.key === selectedKey);
    const selectedSenders = selectedSummary?.senders ?? [];
    const selectedShortcode =
      selectedSummary?.shortcode ?? getShortcodeFor(getHexcodeForEmoji(selectedKey)) ?? selectedKey;

    return (
      <Box
        className={classNames(css.ReactionViewer, className)}
        direction="Row"
        {...props}
        ref={ref}
      >
        <Box shrink="No" className={css.Sidebar}>
          <Scroll visibility="Hover" hideTrack size="300">
            <Box className={css.SidebarContent} direction="Column" gap="200">
              {reactions.map(({ key, count }) => {
                if (typeof key !== 'string') return null;
                return (
                  <Reaction
                    key={key}
                    reaction={key}
                    count={count}
                    aria-selected={key === selectedKey}
                    onClick={() => setSelectedKey(key)}
                  />
                );
              })}
            </Box>
          </Scroll>
        </Box>
        <Line variant="Surface" direction="Vertical" size="300" />
        <Box grow="Yes" direction="Column">
          <Header className={css.Header} variant="Surface" size="600">
            <Box grow="Yes">
              <Text size="H3" truncate>{`Reacted with :${selectedShortcode}:`}</Text>
            </Box>
            <IconButton size="300" onClick={requestClose}>
              <Icon src={Icons.Cross} />
            </IconButton>
          </Header>

          <Box grow="Yes">
            <Scroll visibility="Hover" hideTrack size="300">
              <Box className={css.Content} direction="Column">
                {selectedSenders.map((senderId) => {
                  const member = members.find((entry) => entry.userId === senderId);
                  const rawDisplayName = member?.rawDisplayName;
                  const name =
                    rawDisplayName !== undefined && rawDisplayName !== senderId
                      ? rawDisplayName
                      : getMxIdLocalPart(senderId) ?? senderId;

                  const avatarMxcUrl = member?.avatarMxc;

                  return (
                    <MenuItem
                      key={senderId}
                      style={{ padding: `0 ${config.space.S200}` }}
                      radii="400"
                      onClick={(event: React.MouseEvent<HTMLElement>) => {
                        openProfile(
                          roomId,
                          space?.roomId,
                          senderId,
                          getMouseEventCords(event.nativeEvent),
                          'Bottom'
                        );
                      }}
                      before={
                        <Avatar size="200">
                          <ReactionSenderAvatar
                            userId={senderId}
                            avatarMxc={avatarMxcUrl}
                            name={name}
                          />
                        </Avatar>
                      }
                    >
                      <Box grow="Yes">
                        <Text size="T400" truncate>
                          {name}
                        </Text>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Box>
            </Scroll>
          </Box>
        </Box>
      </Box>
    );
  }
);
