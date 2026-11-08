/* eslint-disable react/destructuring-assignment */
import React, { forwardRef, MouseEventHandler, useCallback, useMemo, useRef } from 'react';
import { Room } from 'matrix-js-sdk';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import {
  Avatar,
  Box,
  Chip,
  color,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Menu,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import type { TimelineItem } from '@harrier/core';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { HTMLReactParserOptions } from 'html-react-parser';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRoomPinnedEvents } from '../../../hooks/useRoomPinnedEvents';
import * as css from './RoomPinMenu.css';
import { SequenceCard } from '../../../components/sequence-card';
import { useCoreEvent } from '../../../hooks/useCoreTimeline';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import {
  AvatarBase,
  DefaultPlaceholder,
  ImageContent,
  MessageNotDecryptedContent,
  ModernLayout,
  MSticker,
  RedactedContent,
  Reply,
  Time,
  Username,
  UsernameBold,
} from '../../../components/message';
import { UserAvatar } from '../../../components/user-avatar';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useCore } from '../../../hooks/useCore';
import { sendRoomState, useCoreRoomState } from '../../../hooks/useCoreRoomState';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../../utils/room';
import { GetContentCallback, StateEvent } from '../../../../types/matrix/room';
import type { IImageContent } from '../../../../types/matrix/common';
import { useMentionClickHandler } from '../../../hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '../../../hooks/useSpoilerClickHandler';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../../plugins/react-custom-html-parser';
import { RenderMessageContent } from '../../../components/RenderMessageContent';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import * as customHtmlCss from '../../../styles/CustomHtml.css';
import { Image } from '../../../components/media';
import { ImageViewer } from '../../../components/image-viewer';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { VirtualTile } from '../../../components/virtualizer';
import { usePowerLevelsContext } from '../../../hooks/usePowerLevels';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { ContainerColor } from '../../../styles/ContainerColor.css';
import { usePowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { useTheme } from '../../../hooks/useTheme';
import { PowerIcon } from '../../../components/power';
import colorMXID from '../../../../util/colorMXID';
import { useIsDirectRoom } from '../../../hooks/useRoom';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import {
  GetMemberPowerTag,
  getPowerTagIconSrc,
  useAccessiblePowerTagColors,
  useGetMemberPowerTag,
} from '../../../hooks/useMemberPowerTag';
import { useRoomCreatorsTag } from '../../../hooks/useRoomCreatorsTag';

const renderPinnedContent = (
  item: TimelineItem,
  displayName: string,
  mediaAutoLoad: boolean,
  urlPreview: boolean,
  htmlReactParserOptions: HTMLReactParserOptions,
  linkifyOpts: LinkifyOpts
): React.ReactNode => {
  switch (item.kind) {
    case 'redacted':
      return <RedactedContent />;
    case 'sticker':
      return (
        <MSticker
          content={item.content as unknown as IImageContent}
          renderImageContent={(props) => (
            <ImageContent
              {...props}
              autoPlay={mediaAutoLoad}
              renderImage={(p) => <Image {...p} loading="lazy" />}
              renderViewer={(p) => <ImageViewer {...p} />}
            />
          )}
        />
      );
    case 'message': {
      const getContent = (() => item.content.raw) as GetContentCallback;
      return (
        <RenderMessageContent
          displayName={displayName}
          msgType={item.content.msgtype}
          ts={item.timestamp}
          getContent={getContent}
          edited={item.edited === true}
          mediaAutoLoad={mediaAutoLoad}
          urlPreview={urlPreview}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
          outlineAttachment
        />
      );
    }
    case 'encrypted':
      return (
        <Text>
          <MessageNotDecryptedContent />
        </Text>
      );
    case 'state':
    case 'unsupported':
      return (
        <Box grow="Yes" direction="Column">
          <Text size="T400" priority="300">
            <code className={customHtmlCss.Code}>{item.eventType}</code>
            {' event'}
          </Text>
        </Box>
      );
    default:
      return null;
  }
};

type PinnedMessageProps = {
  room: Room;
  eventId: string;
  onOpen: (roomId: string, eventId: string) => void;
  canPinEvent: boolean;
  getMemberPowerTag: GetMemberPowerTag;
  accessibleTagColors: Map<string, string>;
  legacyUsernameColor: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: LinkifyOpts;
};
function PinnedMessage({
  room,
  eventId,
  onOpen,
  canPinEvent,
  getMemberPowerTag,
  accessibleTagColors,
  legacyUsernameColor,
  hour24Clock,
  dateFormatString,
  mediaAutoLoad,
  urlPreview,
  htmlReactParserOptions,
  linkifyOpts,
}: PinnedMessageProps) {
  const pinnedItem = useCoreEvent(room.roomId, eventId);
  const useAuthentication = useMediaAuthentication();
  const mx = useMatrixClient();
  const core = useCore();
  const pinnedState = useCoreRoomState<RoomPinnedEventsEventContent>(
    room,
    StateEvent.RoomPinnedEvents
  );

  const [unpinState, unpin] = useAsyncCallback(
    useCallback(() => {
      const content = pinnedState ?? { pinned: [] };
      const newContent: RoomPinnedEventsEventContent = {
        pinned: content.pinned.filter((id) => id !== eventId),
      };

      return sendRoomState(core, room.roomId, StateEvent.RoomPinnedEvents, newContent).then(
        () => newContent
      );
    }, [core, room, eventId, pinnedState])
  );

  const handleOpenClick: MouseEventHandler = (evt) => {
    evt.stopPropagation();
    const evtId = evt.currentTarget.getAttribute('data-event-id');
    if (!evtId) return;
    onOpen(room.roomId, evtId);
  };

  const handleUnpinClick: MouseEventHandler = (evt) => {
    evt.stopPropagation();
    unpin();
  };

  const renderOptions = () => (
    <Box shrink="No" gap="200" alignItems="Center">
      <Chip data-event-id={eventId} onClick={handleOpenClick} variant="Secondary" radii="Pill">
        <Text size="T200">Open</Text>
      </Chip>
      {canPinEvent && (
        <IconButton
          data-event-id={eventId}
          variant="Secondary"
          size="300"
          radii="Pill"
          onClick={unpinState.status === AsyncStatus.Loading ? undefined : handleUnpinClick}
          aria-disabled={unpinState.status === AsyncStatus.Loading}
        >
          {unpinState.status === AsyncStatus.Loading ? (
            <Spinner size="100" />
          ) : (
            <Icon src={Icons.Cross} size="100" />
          )}
        </IconButton>
      )}
    </Box>
  );

  if (pinnedItem === undefined) return <DefaultPlaceholder variant="Secondary" />;
  if (pinnedItem === null)
    return (
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center">
        <Box>
          <Text style={{ color: color.Critical.Main }}>Failed to load message!</Text>
        </Box>
        {renderOptions()}
      </Box>
    );

  const { sender } = pinnedItem;
  const displayName = getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender) ?? sender;
  const senderAvatarMxc = getMemberAvatarMxc(room, sender);

  const memberPowerTag = getMemberPowerTag(sender);
  const tagColor = memberPowerTag?.color
    ? accessibleTagColors?.get(memberPowerTag.color)
    : undefined;
  const tagIconSrc = memberPowerTag?.icon
    ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
    : undefined;

  const usernameColor = legacyUsernameColor ? colorMXID(sender) : tagColor;

  return (
    <ModernLayout
      before={
        <AvatarBase>
          <Avatar size="300">
            <UserAvatar
              userId={sender}
              src={
                senderAvatarMxc
                  ? mxcUrlToHttp(mx, senderAvatarMxc, useAuthentication, 48, 48, 'crop') ??
                    undefined
                  : undefined
              }
              alt={displayName}
              renderFallback={() => <Icon size="200" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarBase>
      }
    >
      <Box gap="300" justifyContent="SpaceBetween" alignItems="Center" grow="Yes">
        <Box gap="200" alignItems="Baseline">
          <Box alignItems="Center" gap="200">
            <Username style={{ color: usernameColor }}>
              <Text as="span" truncate>
                <UsernameBold>{displayName}</UsernameBold>
              </Text>
            </Username>
            {tagIconSrc && <PowerIcon size="100" iconSrc={tagIconSrc} />}
          </Box>
          <Time
            ts={pinnedItem.timestamp}
            hour24Clock={hour24Clock}
            dateFormatString={dateFormatString}
          />
        </Box>
        {renderOptions()}
      </Box>
      {pinnedItem.kind === 'message' && pinnedItem.replyTo && (
        <Reply
          room={room}
          replyEventId={pinnedItem.replyTo}
          threadRootId={pinnedItem.threadRoot}
          onClick={handleOpenClick}
          getMemberPowerTag={getMemberPowerTag}
          accessibleTagColors={accessibleTagColors}
          legacyUsernameColor={legacyUsernameColor}
        />
      )}
      {renderPinnedContent(
        pinnedItem,
        displayName,
        mediaAutoLoad,
        urlPreview,
        htmlReactParserOptions,
        linkifyOpts
      )}
    </ModernLayout>
  );
}

type RoomPinMenuProps = {
  room: Room;
  requestClose: () => void;
};
export const RoomPinMenu = forwardRef<HTMLDivElement, RoomPinMenuProps>(
  ({ room, requestClose }, ref) => {
    const mx = useMatrixClient();
    const userId = mx.getUserId()!;
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const permissions = useRoomPermissions(creators, powerLevels);
    const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, userId);

    const creatorsTag = useRoomCreatorsTag();
    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);

    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const pinnedEvents = useRoomPinnedEvents(room);
    const sortedPinnedEvent = useMemo(() => Array.from(pinnedEvents).reverse(), [pinnedEvents]);
    const useAuthentication = useMediaAuthentication();
    const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
    const [urlPreview] = useSetting(settingsAtom, 'urlPreview');

    const direct = useIsDirectRoom();
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');

    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

    const { navigateRoom } = useRoomNavigate();
    const scrollRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count: sortedPinnedEvent.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => 75,
      overscan: 4,
    });

    const mentionClickHandler = useMentionClickHandler(room.roomId);
    const spoilerClickHandler = useSpoilerClickHandler();

    const linkifyOpts = useMemo<LinkifyOpts>(
      () => ({
        ...LINKIFY_OPTS,
        render: factoryRenderLinkifyWithMention((href) =>
          renderMatrixMention(mx, room.roomId, href, makeMentionCustomProps(mentionClickHandler))
        ),
      }),
      [mx, room, mentionClickHandler]
    );
    const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
      () =>
        getReactCustomHtmlParser(mx, room.roomId, {
          linkifyOpts,
          useAuthentication,
          handleSpoilerClick: spoilerClickHandler,
          handleMentionClick: mentionClickHandler,
        }),
      [mx, room, linkifyOpts, mentionClickHandler, spoilerClickHandler, useAuthentication]
    );

    const handleOpen = (roomId: string, eventId: string) => {
      navigateRoom(roomId, eventId);
      requestClose();
    };

    return (
      <Menu ref={ref} className={css.PinMenu}>
        <Box grow="Yes" direction="Column">
          <Header className={css.PinMenuHeader} size="500">
            <Box grow="Yes">
              <Text size="H5">Pinned Messages</Text>
            </Box>
            <Box shrink="No">
              <IconButton size="300" onClick={requestClose} radii="300">
                <Icon src={Icons.Cross} size="400" />
              </IconButton>
            </Box>
          </Header>
          <Box grow="Yes">
            <Scroll ref={scrollRef} size="300" hideTrack visibility="Hover">
              <Box className={css.PinMenuContent} direction="Column" gap="100">
                {sortedPinnedEvent.length > 0 ? (
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    {virtualizer.getVirtualItems().map((vItem) => {
                      const eventId = sortedPinnedEvent[vItem.index];
                      if (!eventId) return null;

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S200 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <SequenceCard
                            style={{ padding: config.space.S400, borderRadius: config.radii.R300 }}
                            variant="SurfaceVariant"
                            direction="Column"
                          >
                            <PinnedMessage
                              room={room}
                              eventId={eventId}
                              onOpen={handleOpen}
                              canPinEvent={canPinEvent}
                              getMemberPowerTag={getMemberPowerTag}
                              accessibleTagColors={accessibleTagColors}
                              legacyUsernameColor={legacyUsernameColor || direct}
                              hour24Clock={hour24Clock}
                              dateFormatString={dateFormatString}
                              mediaAutoLoad={mediaAutoLoad}
                              urlPreview={urlPreview}
                              htmlReactParserOptions={htmlReactParserOptions}
                              linkifyOpts={linkifyOpts}
                            />
                          </SequenceCard>
                        </VirtualTile>
                      );
                    })}
                  </div>
                ) : (
                  <Box
                    className={ContainerColor({ variant: 'SurfaceVariant' })}
                    style={{
                      marginBottom: config.space.S200,
                      padding: `${config.space.S700} ${config.space.S400} ${toRem(60)}`,
                      borderRadius: config.radii.R300,
                    }}
                    grow="Yes"
                    direction="Column"
                    gap="400"
                    justifyContent="Center"
                    alignItems="Center"
                  >
                    <Icon src={Icons.Pin} size="600" />
                    <Box
                      style={{ maxWidth: toRem(300) }}
                      direction="Column"
                      gap="200"
                      alignItems="Center"
                    >
                      <Text size="H4" align="Center">
                        No Pinned Messages
                      </Text>
                      <Text size="T400" align="Center">
                        Users with sufficient power level can pin a messages from its context menu.
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>
            </Scroll>
          </Box>
        </Box>
      </Menu>
    );
  }
);
