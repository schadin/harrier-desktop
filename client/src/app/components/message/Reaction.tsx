import React from 'react';
import { Box, Text, as } from 'folds';
import classNames from 'classnames';
import * as css from './Reaction.css';
import { getHexcodeForEmoji, getShortcodeFor } from '../../plugins/emoji';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { getMxIdLocalPart } from '../../utils/matrix';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';

function ReactionEmote({ reaction }: { reaction: string }) {
  const src = useMediaSource(toMediaRef(reaction));
  return <img className={css.ReactionImg} src={src} alt={reaction} />;
}

export const Reaction = as<
  'button',
  {
    count: number;
    reaction: string;
  }
>(({ className, count, reaction, ...props }, ref) => (
  <Box
    as="button"
    className={classNames(css.Reaction, className)}
    alignItems="Center"
    shrink="No"
    gap="200"
    {...props}
    ref={ref}
  >
    <Text className={css.ReactionText} as="span" size="T400">
      {reaction.startsWith('mxc://') ? (
        <ReactionEmote reaction={reaction} />
      ) : (
        <Text as="span" size="Inherit" truncate>
          {reaction}
        </Text>
      )}
    </Text>
    <Text as="span" size="T300">
      {count}
    </Text>
  </Box>
));

type ReactionTooltipMsgProps = {
  roomId: string;
  reaction: string;
  senders: readonly string[];
  shortcode?: string;
};

export function ReactionTooltipMsg({
  roomId,
  reaction,
  senders,
  shortcode: reactionShortcode,
}: ReactionTooltipMsgProps) {
  const members = useRoomMembers(roomId);
  const shortcode = reactionShortcode ?? getShortcodeFor(getHexcodeForEmoji(reaction)) ?? reaction;
  const names = senders.map((senderId) => {
    const rawDisplayName = members.find((member) => member.userId === senderId)?.rawDisplayName;
    return rawDisplayName !== undefined && rawDisplayName !== senderId
      ? rawDisplayName
      : getMxIdLocalPart(senderId) ?? 'Unknown';
  });

  return (
    <>
      {names.length === 1 && <b>{names[0]}</b>}
      {names.length === 2 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[1]}</b>
        </>
      )}
      {names.length === 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[2]}</b>
        </>
      )}
      {names.length > 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[2]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names.length - 3} others</b>
        </>
      )}
      <Text as="span" size="Inherit" priority="300">
        {' reacted with '}
      </Text>
      :<b>{shortcode}</b>:
    </>
  );
}
