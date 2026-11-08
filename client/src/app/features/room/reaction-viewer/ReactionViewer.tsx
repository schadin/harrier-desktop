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
import { Room } from 'matrix-js-sdk';
import type { ReactionCountView } from '@harrier/core';
import { getMemberDisplayName } from '../../../utils/room';
import { getMxIdLocalPart } from '../../../utils/matrix';
import * as css from './ReactionViewer.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { Reaction } from '../../../components/message';
import { getHexcodeForEmoji, getShortcodeFor } from '../../../plugins/emoji';
import { UserAvatar } from '../../../components/user-avatar';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '../../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../../hooks/useSpace';
import { getMouseEventCords } from '../../../utils/dom';

export type ReactionViewerProps = {
  room: Room;
  initialKey?: string;
  reactions: readonly ReactionCountView[];
  requestClose: () => void;
};
export const ReactionViewer = as<'div', ReactionViewerProps>(
  ({ className, room, initialKey, reactions, requestClose, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
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
                    mx={mx}
                    reaction={key}
                    count={count}
                    aria-selected={key === selectedKey}
                    onClick={() => setSelectedKey(key)}
                    useAuthentication={useAuthentication}
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
                  const member = room.getMember(senderId);
                  const name =
                    (member ? getMemberDisplayName(room, senderId) : getMxIdLocalPart(senderId)) ??
                    senderId;

                  const avatarMxcUrl = member?.getMxcAvatarUrl();
                  const avatarUrl = avatarMxcUrl
                    ? mx.mxcUrlToHttp(
                        avatarMxcUrl,
                        100,
                        100,
                        'crop',
                        undefined,
                        false,
                        useAuthentication
                      )
                    : undefined;

                  return (
                    <MenuItem
                      key={senderId}
                      style={{ padding: `0 ${config.space.S200}` }}
                      radii="400"
                      onClick={(event: React.MouseEvent<HTMLElement>) => {
                        openProfile(
                          room.roomId,
                          space?.roomId,
                          senderId,
                          getMouseEventCords(event.nativeEvent),
                          'Bottom'
                        );
                      }}
                      before={
                        <Avatar size="200">
                          <UserAvatar
                            userId={senderId}
                            src={avatarUrl ?? undefined}
                            alt={name}
                            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
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
