/* eslint-disable react/destructuring-assignment */
import React, { MouseEventHandler, useMemo } from 'react';
import type { MessageSearchEventView } from '@harrier/core';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Avatar, Box, Chip, Header, Icon, Icons, Text, config } from 'folds';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCoreRoom } from '../../hooks/useCoreRoom';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeHighlightRegex,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';
import { getMxIdLocalPart } from '../../utils/matrix';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';
import { useMatrixEventRenderer } from '../../hooks/useMatrixEventRenderer';
import { GetContentCallback, MessageEvent, StateEvent } from '../../../types/matrix/room';
import {
  AvatarBase,
  ImageContent,
  MSticker,
  ModernLayout,
  RedactedContent,
  Reply,
  Time,
  Username,
  UsernameBold,
} from '../../components/message';
import { RenderMessageContent } from '../../components/RenderMessageContent';
import { Image } from '../../components/media';
import { ImageViewer } from '../../components/image-viewer';
import * as customHtmlCss from '../../styles/CustomHtml.css';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';

import { ResultItem } from './useMessageSearch';
import { SequenceCard } from '../../components/sequence-card';
import { UserAvatar } from '../../components/user-avatar';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '../../hooks/useSpoilerClickHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useTheme } from '../../hooks/useTheme';
import { PowerIcon } from '../../components/power';
import colorMXID from '../../../util/colorMXID';
import {
  getPowerTagIconSrc,
  useAccessiblePowerTagColors,
  useGetMemberPowerTag,
} from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';

function SearchResultUserAvatar({
  userId,
  avatarMxc,
  name,
}: {
  userId: string;
  avatarMxc?: string;
  name: string;
}) {
  const src = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 48, height: 48, resizeMethod: 'crop' }) : undefined
  );

  return (
    <UserAvatar
      userId={userId}
      src={src}
      alt={name}
      renderFallback={() => <Icon size="200" src={Icons.User} filled />}
    />
  );
}

function SearchResultRoomAvatar({
  roomId,
  avatarMxc,
  name,
  roomType,
  joinRule,
}: {
  roomId: string;
  avatarMxc?: string;
  name: string;
  roomType?: string;
  joinRule?: string;
}) {
  const src = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 96, height: 96, resizeMethod: 'crop' }) : undefined
  );

  return (
    <RoomAvatar
      roomId={roomId}
      src={src}
      alt={name}
      renderFallback={() => <RoomIcon size="50" roomType={roomType} joinRule={joinRule} filled />}
    />
  );
}

type SearchResultGroupProps = {
  roomId: string;
  highlights: string[];
  items: ResultItem[];
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  onOpen: (roomId: string, eventId: string) => void;
  legacyUsernameColor?: boolean;
  hour24Clock: boolean;
  dateFormatString: string;
};
export function SearchResultGroup({
  roomId,
  highlights,
  items,
  mediaAutoLoad,
  urlPreview,
  onOpen,
  legacyUsernameColor,
  hour24Clock,
  dateFormatString,
}: SearchResultGroupProps) {
  const mx = useMatrixClient();
  const room = useCoreRoom(roomId);
  const members = useRoomMembers(roomId);
  const useAuthentication = useMediaAuthentication();
  const highlightRegex = useMemo(() => makeHighlightRegex(highlights), [highlights]);

  const powerLevels = usePowerLevels({ roomId });
  const creators = useRoomCreators({ roomId });

  const creatorsTag = useRoomCreatorsTag();
  const powerLevelTags = usePowerLevelTags({ roomId }, powerLevels);
  const getMemberPowerTag = useGetMemberPowerTag({ roomId }, creators, powerLevels);

  const theme = useTheme();
  const accessibleTagColors = useAccessiblePowerTagColors(theme.kind, creatorsTag, powerLevelTags);

  const mentionClickHandler = useMentionClickHandler(roomId);
  const spoilerClickHandler = useSpoilerClickHandler();

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(mx, roomId, href, makeMentionCustomProps(mentionClickHandler))
      ),
    }),
    [mx, roomId, mentionClickHandler]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, roomId, {
        linkifyOpts,
        highlightRegex,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [
      mx,
      roomId,
      linkifyOpts,
      highlightRegex,
      mentionClickHandler,
      spoilerClickHandler,
      useAuthentication,
    ]
  );

  const renderMatrixEvent = useMatrixEventRenderer<
    [MessageSearchEventView, string, GetContentCallback]
  >(
    {
      [MessageEvent.RoomMessage]: (event, displayName, getContent) => {
        if (event.unsigned?.redacted_because) {
          return <RedactedContent reason={event.unsigned?.redacted_because.content?.reason} />;
        }

        return (
          <RenderMessageContent
            displayName={displayName}
            msgType={typeof event.content.msgtype === 'string' ? event.content.msgtype : ''}
            ts={event.origin_server_ts}
            getContent={getContent}
            mediaAutoLoad={mediaAutoLoad}
            urlPreview={urlPreview}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
            highlightRegex={highlightRegex}
            outlineAttachment
          />
        );
      },
      [MessageEvent.Reaction]: (event, displayName, getContent) => {
        if (event.unsigned?.redacted_because) {
          return <RedactedContent reason={event.unsigned?.redacted_because.content?.reason} />;
        }
        return (
          <MSticker
            content={getContent()}
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
      },
      [StateEvent.RoomTombstone]: (event) => {
        const { content } = event;
        return (
          <Box grow="Yes" direction="Column">
            <Text size="T400" priority="300">
              Room Tombstone. {typeof content.body === 'string' ? content.body : ''}
            </Text>
          </Box>
        );
      },
    },
    undefined,
    (event) => {
      if (event.unsigned?.redacted_because) {
        return <RedactedContent reason={event.unsigned?.redacted_because.content?.reason} />;
      }
      return (
        <Box grow="Yes" direction="Column">
          <Text size="T400" priority="300">
            <code className={customHtmlCss.Code}>{event.type}</code>
            {' event'}
          </Text>
        </Box>
      );
    }
  );

  if (!room) return null;

  const handleOpenClick: MouseEventHandler = (evt) => {
    const eventId = evt.currentTarget.getAttribute('data-event-id');
    if (!eventId) return;
    onOpen(roomId, eventId);
  };

  return (
    <Box direction="Column" gap="200">
      <Header size="300">
        <Box gap="200" grow="Yes">
          <Avatar size="200" radii="300">
            <SearchResultRoomAvatar
              roomId={roomId}
              avatarMxc={room?.avatarMxc}
              name={room?.name ?? roomId}
              roomType={room?.roomType}
              joinRule={room?.joinRule ?? 'restricted'}
            />
          </Avatar>
          <Text size="H4" truncate>
            {room?.name ?? roomId}
          </Text>
        </Box>
      </Header>
      <Box direction="Column" gap="100">
        {items.map((item) => {
          const { event } = item;

          const member = members.find((entry) => entry.userId === event.sender);
          const rawDisplayName = member?.rawDisplayName;
          const displayName =
            rawDisplayName !== undefined && rawDisplayName !== event.sender
              ? rawDisplayName
              : getMxIdLocalPart(event.sender) ?? event.sender;
          const senderAvatarMxc = member?.avatarMxc;

          const relation = event.content['m.relates_to'] as
            | {
                rel_type?: string;
                event_id?: string;
                'm.in_reply_to'?: { event_id?: string };
              }
            | undefined;
          const mainEventId =
            relation?.rel_type === 'm.replace' ? relation.event_id : event.event_id;

          const getContent = (() =>
            event.content['m.new_content'] ?? event.content) as GetContentCallback;

          const replyEventId = relation?.['m.in_reply_to']?.event_id;
          const threadRootId = relation?.rel_type === 'm.thread' ? relation.event_id : undefined;

          const memberPowerTag = getMemberPowerTag(event.sender);
          const tagColor = memberPowerTag?.color
            ? accessibleTagColors?.get(memberPowerTag.color)
            : undefined;
          const tagIconSrc = memberPowerTag?.icon
            ? getPowerTagIconSrc(mx, useAuthentication, memberPowerTag.icon)
            : undefined;

          const usernameColor = legacyUsernameColor ? colorMXID(event.sender) : tagColor;

          return (
            <SequenceCard
              key={event.event_id}
              style={{ padding: config.space.S400 }}
              variant="SurfaceVariant"
              direction="Column"
            >
              <ModernLayout
                before={
                  <AvatarBase>
                    <Avatar size="300">
                      <SearchResultUserAvatar
                        userId={event.sender}
                        avatarMxc={senderAvatarMxc}
                        name={displayName}
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
                      ts={event.origin_server_ts}
                      hour24Clock={hour24Clock}
                      dateFormatString={dateFormatString}
                    />
                  </Box>
                  <Box shrink="No" gap="200" alignItems="Center">
                    <Chip
                      data-event-id={mainEventId}
                      onClick={handleOpenClick}
                      variant="Secondary"
                      radii="400"
                    >
                      <Text size="T200">Open</Text>
                    </Chip>
                  </Box>
                </Box>
                {replyEventId && (
                  <Reply
                    roomId={roomId}
                    replyEventId={replyEventId}
                    threadRootId={threadRootId}
                    onClick={handleOpenClick}
                    getMemberPowerTag={getMemberPowerTag}
                    accessibleTagColors={accessibleTagColors}
                    legacyUsernameColor={legacyUsernameColor}
                  />
                )}
                {renderMatrixEvent(event.type, false, event, displayName, getContent)}
              </ModernLayout>
            </SequenceCard>
          );
        })}
      </Box>
    </Box>
  );
}
