import React from 'react';
import { Box, Text, as } from 'folds';
import classNames from 'classnames';
import { MatrixClient, Room } from 'matrix-js-sdk';
import * as css from './Reaction.css';
import { getHexcodeForEmoji, getShortcodeFor } from '../../plugins/emoji';
import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';

export const Reaction = as<
  'button',
  {
    mx: MatrixClient;
    count: number;
    reaction: string;
    useAuthentication?: boolean;
  }
>(({ className, mx, count, reaction, useAuthentication, ...props }, ref) => (
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
        <img
          className={css.ReactionImg}
          src={mxcUrlToHttp(mx, reaction, useAuthentication) ?? reaction}
          alt={reaction}
        />
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
  room: Room;
  reaction: string;
  senders: readonly string[];
  shortcode?: string;
};

export function ReactionTooltipMsg({
  room,
  reaction,
  senders,
  shortcode: reactionShortcode,
}: ReactionTooltipMsgProps) {
  const shortcode = reactionShortcode ?? getShortcodeFor(getHexcodeForEmoji(reaction)) ?? reaction;
  const names = senders.map(
    (senderId) => getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? 'Unknown'
  );

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
