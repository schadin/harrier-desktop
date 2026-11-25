import { getMatrixClient } from '@harrier/core-matrix-js';
import React, { MouseEventHandler, forwardRef, useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Text,
  Menu,
  MenuItem,
  config,
  PopOut,
  toRem,
  Line,
  RectCords,
  Badge,
  Spinner,
} from 'folds';
import { useFocusWithin, useHover } from 'react-aria';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue } from 'jotai';
import { NavItem, NavItemContent, NavItemOptions, NavLink } from '../../components/nav';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { nameInitials } from '../../utils/common';
import { useCore } from '../../hooks/useCore';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { copyToClipboard } from '../../utils/dom';
import { markAsRead } from '../../utils/notifications';
import { UseStateProvider } from '../../components/UseStateProvider';
import { LeaveRoomPrompt } from '../../components/leave-room-prompt';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';
import { TypingIndicator } from '../../components/typing-indicator';
import { stopPropagation } from '../../utils/keyboard';
import { getMatrixToRoom } from '../../plugins/matrix-to';
import { getCanonicalAliasOrRoomId } from '../../utils/coreRoomNavigation';
import { isRoomAlias } from '../../utils/matrix';
import { useCustomStatus } from '../../hooks/useCustomStatus';
import { useUserPresence } from '../../hooks/useUserPresence';
import { PresenceStatus } from '../../components/presence';
import { getViaServers } from '../../plugins/via-servers';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useOpenRoomSettings } from '../../state/hooks/roomSettings';
import { useSpaceId } from '../../hooks/useSpace';
import {
  getRoomNotificationModeIcon,
  RoomNotificationMode,
} from '../../hooks/useRoomsNotificationPreferences';
import { RoomNotificationModeSwitcher } from '../../components/RoomNotificationSwitcher';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { useCoreRoomMeta } from '../../hooks/useCoreRoomMeta';
import { getSafeSessionUserId, useCoreSession } from '../../hooks/useCoreSession';
import { useCoreCallMembers } from '../../hooks/useCall';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { callChatAtom } from '../../state/callEmbed';
import { useCallPreferencesAtom } from '../../state/hooks/callPreferences';
import { useAutoDiscoveryInfo } from '../../hooks/useAutoDiscoveryInfo';
import { livekitSupport } from '../../hooks/useLivekitSupport';
import { RoomType, StateEvent } from '../../../types/matrix/room';
import { webRTCSupported } from '../../utils/rtc';

type RoomNavItemMenuProps = {
  roomId: string;
  requestClose: () => void;
  notificationMode?: RoomNotificationMode;
};
const RoomNavItemMenu = forwardRef<HTMLDivElement, RoomNavItemMenuProps>(
  ({ roomId, requestClose, notificationMode }, ref) => {
    const core = useCore();
    const session = useCoreSession();
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const unread = useRoomUnread(roomId, roomToUnreadAtom);
    const powerLevels = usePowerLevels({ roomId });
    const creators = useRoomCreators({ roomId });

    const permissions = useRoomPermissions(creators, powerLevels);
    const canInvite = permissions.action('invite', getSafeSessionUserId(session));
    const openRoomSettings = useOpenRoomSettings();
    const spaceId = useSpaceId();

    const [invitePrompt, setInvitePrompt] = useState(false);

    const handleMarkAsRead = () => {
      markAsRead(core, roomId, hideActivity);
      requestClose();
    };

    const handleInvite = () => {
      setInvitePrompt(true);
    };

    const handleCopyLink = () => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(core, roomId);
      const viaServers = isRoomAlias(roomIdOrAlias) ? undefined : getViaServers(core, roomId);
      copyToClipboard(getMatrixToRoom(roomIdOrAlias, viaServers));
      requestClose();
    };

    const handleRoomSettings = () => {
      openRoomSettings(roomId, spaceId ?? undefined);
      requestClose();
    };

    return (
      <Menu ref={ref} style={{ maxWidth: toRem(160), width: '100vw' }}>
        {invitePrompt && (
          <InviteUserPrompt
            roomId={roomId}
            requestClose={() => {
              setInvitePrompt(false);
              requestClose();
            }}
          />
        )}
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleMarkAsRead}
            size="300"
            after={<Icon size="100" src={Icons.CheckTwice} />}
            radii="300"
            disabled={!unread}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Mark as Read
            </Text>
          </MenuItem>
          <RoomNotificationModeSwitcher roomId={roomId} value={notificationMode}>
            {(handleOpen, opened, changing) => (
              <MenuItem
                size="300"
                after={
                  changing ? (
                    <Spinner size="100" variant="Secondary" />
                  ) : (
                    <Icon size="100" src={getRoomNotificationModeIcon(notificationMode)} />
                  )
                }
                radii="300"
                aria-pressed={opened}
                onClick={handleOpen}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  Notifications
                </Text>
              </MenuItem>
            )}
          </RoomNotificationModeSwitcher>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <MenuItem
            onClick={handleInvite}
            variant="Primary"
            fill="None"
            size="300"
            after={<Icon size="100" src={Icons.UserPlus} />}
            radii="300"
            aria-pressed={invitePrompt}
            disabled={!canInvite}
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Invite
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleCopyLink}
            size="300"
            after={<Icon size="100" src={Icons.Link} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Copy Link
            </Text>
          </MenuItem>
          <MenuItem
            onClick={handleRoomSettings}
            size="300"
            after={<Icon size="100" src={Icons.Setting} />}
            radii="300"
          >
            <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
              Room Settings
            </Text>
          </MenuItem>
        </Box>
        <Line variant="Surface" size="300" />
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          <UseStateProvider initial={false}>
            {(promptLeave, setPromptLeave) => (
              <>
                <MenuItem
                  onClick={() => setPromptLeave(true)}
                  variant="Critical"
                  fill="None"
                  size="300"
                  after={<Icon size="100" src={Icons.ArrowGoLeft} />}
                  radii="300"
                  aria-pressed={promptLeave}
                >
                  <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                    Leave Room
                  </Text>
                </MenuItem>
                {promptLeave && (
                  <LeaveRoomPrompt
                    roomId={roomId}
                    onDone={requestClose}
                    onCancel={() => setPromptLeave(false)}
                  />
                )}
              </>
            )}
          </UseStateProvider>
        </Box>
      </Menu>
    );
  }
);

function CallChatToggle() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <IconButton
      onClick={() => setChat(!chat)}
      aria-pressed={chat}
      aria-label="Toggle Chat"
      variant="Background"
      fill="None"
      size="300"
      radii="300"
    >
      <Icon size="50" src={Icons.Message} filled={chat} />
    </IconButton>
  );
}

type RoomNavItemProps = {
  roomId: string;
  selected: boolean;
  linkPath: string;
  notificationMode?: RoomNotificationMode;
  showAvatar?: boolean;
  direct?: boolean;
};
export function RoomNavItem({
  roomId,
  selected,
  showAvatar,
  direct,
  notificationMode,
  linkPath,
}: RoomNavItemProps) {
  const core = useCore();
  const session = useCoreSession();
  const powerLevels = usePowerLevels({ roomId });
  const creators = useRoomCreators({ roomId });
  const permissions = useRoomPermissions(creators, powerLevels);
  const useAuthentication = useMediaAuthentication();
  const [hover, setHover] = useState(false);
  const { hoverProps } = useHover({ onHoverChange: setHover });
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setHover });
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const unread = useRoomUnread(roomId, roomToUnreadAtom);
  const typingMember = useRoomTypingMember(roomId).filter(
    (receipt) => receipt.userId !== session?.userId
  );

  const { room: coreRoom, name: roomName } = useCoreRoomMeta(roomId);
  let avatarUrl: string | undefined;
  if (coreRoom) {
    avatarUrl = direct
      ? getDirectRoomAvatarUrl(core, coreRoom, 96, useAuthentication)
      : getRoomAvatarUrl(core, coreRoom, 96, useAuthentication);
  }
  const dmUserId = direct ? coreRoom?.dmUserId ?? session?.userId : undefined;
  const dmStatus = useCustomStatus(dmUserId ?? '');
  const dmPresence = useUserPresence(dmUserId ?? '');

  const handleContextMenu: MouseEventHandler<HTMLElement> = (evt) => {
    evt.preventDefault();
    setMenuAnchor({
      x: evt.clientX,
      y: evt.clientY,
      width: 0,
      height: 0,
    });
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const optionsVisible = hover || !!menuAnchor;
  const callMembers = useCoreCallMembers(roomId);
  const startCall = useCallStart(direct);
  const callEmbed = useCallEmbed();
  const callPref = useAtomValue(useCallPreferencesAtom());
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  if (!coreRoom) return null;
  const isCallRoom = coreRoom.roomType === RoomType.Call;

  const handleStartCall: MouseEventHandler<HTMLAnchorElement> = (evt) => {
    const hasCallPermission = permissions.stateEvent(
      StateEvent.GroupCallMemberPrefix,
      getSafeSessionUserId(session)
    );

    // Do not join if missing permissions or no livekit support or no webRTC support
    if (!hasCallPermission || !livekitSupport(autoDiscoveryInfo) || !webRTCSupported()) {
      return;
    }

    // Do not join if already in call
    if (callEmbed) {
      return;
    }
    // Start call in second click
    if (selected) {
      evt.preventDefault();
      // Temporary call/widget bridge: useCallStart still requires the raw SDK room.
      const mx = getMatrixClient(core);
      const callRoom = mx.getRoom(roomId);
      if (callRoom) startCall(callRoom, callPref);
    }
  };

  return (
    <NavItem
      variant="Background"
      radii="400"
      highlight={unread !== undefined}
      aria-selected={selected}
      data-hover={!!menuAnchor}
      onContextMenu={handleContextMenu}
      {...hoverProps}
      {...focusWithinProps}
    >
      <NavLink to={linkPath} onClick={isCallRoom ? handleStartCall : undefined}>
        <NavItemContent>
          <Box as="span" grow="Yes" alignItems="Center" gap="200">
            <Avatar size="200" radii="400">
              {showAvatar ? (
                <RoomAvatar
                  roomId={roomId}
                  src={avatarUrl}
                  alt={roomName}
                  renderFallback={() => (
                    <Text as="span" size="H6">
                      {nameInitials(roomName)}
                    </Text>
                  )}
                />
              ) : (
                <RoomIcon
                  style={{
                    opacity: unread ? config.opacity.P500 : config.opacity.P300,
                  }}
                  filled={selected}
                  size="100"
                  joinRule={coreRoom.joinRule}
                  roomType={coreRoom.roomType}
                />
              )}
            </Avatar>
            <Box as="span" grow="Yes" direction="Column" gap="0" justifyContent="Center">
              <Box as="span" alignItems="Center" gap="200">
                <Text priority={unread ? '500' : '300'} as="span" size="Inherit" truncate>
                  {roomName}
                </Text>
                {direct && dmStatus?.emoji && (
                  <Text as="span" size="Inherit" priority="300">
                    {dmStatus.emoji}
                  </Text>
                )}
              </Box>
              {direct && (dmStatus?.text || dmPresence) && (
                <Box as="span" alignItems="Center" gap="100">
                  {dmStatus?.text && (
                    <Text as="span" size="T200" priority="300" truncate>
                      {dmStatus.text}
                    </Text>
                  )}
                  {dmStatus?.text && dmPresence && (
                    <Text as="span" size="T200" priority="400">
                      •
                    </Text>
                  )}
                  {dmPresence && <PresenceStatus presence={dmPresence} />}
                </Box>
              )}
            </Box>
            {!optionsVisible && !unread && !selected && typingMember.length > 0 && (
              <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
                <TypingIndicator size="300" disableAnimation />
              </Badge>
            )}
            {!optionsVisible && unread && (
              <UnreadBadgeCenter>
                <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
              </UnreadBadgeCenter>
            )}
            {!optionsVisible && notificationMode !== RoomNotificationMode.Unset && (
              <Icon
                size="50"
                src={getRoomNotificationModeIcon(notificationMode)}
                aria-label={notificationMode}
              />
            )}
            {callMembers.length > 0 && (
              <Badge variant="Critical" fill="Solid" size="400">
                <Text as="span" size="L400" truncate>
                  {callMembers.length} Live
                </Text>
              </Badge>
            )}
          </Box>
        </NavItemContent>
      </NavLink>
      {optionsVisible && (
        <NavItemOptions>
          {selected && (callEmbed?.roomId === roomId || isCallRoom) && <CallChatToggle />}
          <PopOut
            id={`menu-${roomId}`}
            aria-expanded={!!menuAnchor}
            anchor={menuAnchor}
            offset={menuAnchor?.width === 0 ? 0 : undefined}
            alignOffset={menuAnchor?.width === 0 ? 0 : -5}
            position="Bottom"
            align={menuAnchor?.width === 0 ? 'Start' : 'End'}
            content={
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setMenuAnchor(undefined),
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <RoomNavItemMenu
                  roomId={roomId}
                  requestClose={() => setMenuAnchor(undefined)}
                  notificationMode={notificationMode}
                />
              </FocusTrap>
            }
          >
            <IconButton
              onClick={handleOpenMenu}
              aria-pressed={!!menuAnchor}
              aria-controls={`menu-${roomId}`}
              aria-label="More Options"
              variant="Background"
              fill="None"
              size="300"
              radii="300"
            >
              <Icon size="50" src={Icons.VerticalDots} />
            </IconButton>
          </PopOut>
        </NavItemOptions>
      )}
    </NavItem>
  );
}
