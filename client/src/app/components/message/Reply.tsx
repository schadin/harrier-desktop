import { Box, Icon, Icons, Text, as, color, toRem } from 'folds';
import { Room } from 'matrix-js-sdk';
import React, { MouseEventHandler, ReactNode, useMemo } from 'react';
import classNames from 'classnames';
import type { TimelineItem } from '@harrier/core';
import { getMemberDisplayName, trimReplyFromBody } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { LinePlaceholder } from './placeholder';
import { randomNumberBetween } from '../../utils/common';
import * as css from './Reply.css';
import { MessageBadEncryptedContent, MessageDeletedContent, MessageFailedContent } from './content';
import { scaleSystemEmoji } from '../../plugins/react-custom-html-parser';
import { useCoreEvent } from '../../hooks/useCoreTimeline';
import colorMXID from '../../../util/colorMXID';
import { GetMemberPowerTag } from '../../hooks/useMemberPowerTag';

type ReplyLayoutProps = {
  userColor?: string;
  username?: ReactNode;
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, className, children, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, className)}
      alignItems="Center"
      gap="100"
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        <Icon size="100" src={Icons.ReplyArrow} />
        {username}
      </Box>
      <Box grow="Yes" className={css.ReplyContent}>
        {children}
      </Box>
    </Box>
  )
);

export const ThreadIndicator = as<'div'>(({ ...props }, ref) => (
  <Box
    shrink="No"
    className={css.ThreadIndicator}
    alignItems="Center"
    gap="100"
    {...props}
    ref={ref}
  >
    <Icon size="50" src={Icons.Thread} />
    <Text size="L400">Thread</Text>
  </Box>
));

const itemBody = (item: TimelineItem | undefined): string | undefined => {
  if (!item) return undefined;
  if (item.kind === 'message' || item.kind === 'state' || item.kind === 'sticker') {
    const { body } = item.content as { body?: unknown };
    return typeof body === 'string' ? body : undefined;
  }
  return undefined;
};

type ReplyProps = {
  room: Room;
  replyEventId: string;
  replyItem?: TimelineItem | undefined;
  threadRootId?: string | undefined;
  onClick?: MouseEventHandler | undefined;
  getMemberPowerTag?: GetMemberPowerTag;
  accessibleTagColors?: Map<string, string>;
  legacyUsernameColor?: boolean;
};

export const Reply = as<'div', ReplyProps>(
  (
    {
      room,
      replyEventId,
      replyItem,
      threadRootId,
      onClick,
      getMemberPowerTag,
      accessibleTagColors,
      legacyUsernameColor,
      ...props
    },
    ref
  ) => {
    const placeholderWidth = useMemo(() => randomNumberBetween(40, 400), []);
    // Без replyItem (поиск, закрепы, уведомления) событие резолвится
    // через core (`timeline.event`), а не через SDK-фетч.
    const fetchedItem = useCoreEvent(room.roomId, replyEventId, !replyItem);
    const resolvedItem = replyItem ?? fetchedItem ?? undefined;

    const body = itemBody(resolvedItem);
    const sender = resolvedItem?.sender;
    const powerTag = sender ? getMemberPowerTag?.(sender) : undefined;
    const tagColor = powerTag?.color ? accessibleTagColors?.get(powerTag.color) : undefined;

    const usernameColor = legacyUsernameColor ? colorMXID(sender ?? replyEventId) : tagColor;

    const isRedacted = resolvedItem?.kind === 'redacted';
    const fallbackBody = isRedacted ? <MessageDeletedContent /> : <MessageFailedContent />;

    const badEncryption = resolvedItem?.kind === 'encrypted';
    const bodyJSX = body ? scaleSystemEmoji(trimReplyFromBody(body)) : fallbackBody;

    // null от useCoreEvent — событие не найдено: показываем fallback,
    // undefined — ещё грузим: показываем placeholder.
    const hasReply = replyItem !== undefined || fetchedItem !== undefined;

    return (
      <Box direction="Row" gap="200" alignItems="Center" {...props} ref={ref}>
        {threadRootId && (
          <ThreadIndicator as="button" data-event-id={threadRootId} onClick={onClick} />
        )}
        <ReplyLayout
          as="button"
          userColor={usernameColor}
          username={
            sender && (
              <Text size="T300" truncate>
                <b>{getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender)}</b>
              </Text>
            )
          }
          data-event-id={replyEventId}
          onClick={onClick}
        >
          {hasReply ? (
            <Text size="T300" truncate>
              {badEncryption ? <MessageBadEncryptedContent /> : bodyJSX}
            </Text>
          ) : (
            <LinePlaceholder
              style={{
                backgroundColor: color.SurfaceVariant.ContainerActive,
                width: toRem(placeholderWidth),
                maxWidth: '100%',
              }}
            />
          )}
        </ReplyLayout>
      </Box>
    );
  }
);
