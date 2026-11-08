import React, { MouseEventHandler, useState } from 'react';
import {
  Box,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  toRem,
} from 'folds';
import classNames from 'classnames';
import { Room } from 'matrix-js-sdk';
import type { ReactionCountView } from '@harrier/core';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { Reaction, ReactionTooltipMsg } from '../../../components/message';
import * as css from './styles.css';
import { ReactionViewer } from '../reaction-viewer';
import { stopPropagation } from '../../../utils/keyboard';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';

export type ReactionsProps = {
  room: Room;
  mEventId: string;
  canSendReaction?: boolean;
  reactions: readonly ReactionCountView[];
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
};
export const Reactions = as<'div', ReactionsProps>(
  ({ className, room, reactions, mEventId, canSendReaction, onReactionToggle, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [viewer, setViewer] = useState<boolean | string>(false);
    const myUserId = mx.getUserId();

    const handleViewReaction: MouseEventHandler<HTMLButtonElement> = (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      const key = evt.currentTarget.getAttribute('data-reaction-key');
      if (!key) setViewer(true);
      else setViewer(key);
    };

    return (
      <Box
        className={classNames(css.ReactionsContainer, className)}
        gap="200"
        wrap="Wrap"
        {...props}
        ref={ref}
      >
        {reactions.map((reaction) => {
          const { key, count, senders, shortcode } = reaction;
          if (count === 0 || typeof key !== 'string') return null;
          const isPressed = myUserId !== null && senders.includes(myUserId);

          return (
            <TooltipProvider
              key={key}
              position="Top"
              tooltip={
                <Tooltip style={{ maxWidth: toRem(200) }}>
                  <Text className={css.ReactionsTooltipText} size="T300">
                    <ReactionTooltipMsg
                      room={room}
                      reaction={key}
                      senders={senders}
                      shortcode={shortcode}
                    />
                  </Text>
                </Tooltip>
              }
            >
              {(targetRef) => (
                <Reaction
                  ref={targetRef}
                  data-reaction-key={key}
                  aria-pressed={isPressed}
                  key={key}
                  mx={mx}
                  reaction={key}
                  count={count}
                  onClick={
                    canSendReaction ? () => onReactionToggle(mEventId, key, shortcode) : undefined
                  }
                  onContextMenu={handleViewReaction}
                  aria-disabled={!canSendReaction}
                  useAuthentication={useAuthentication}
                />
              )}
            </TooltipProvider>
          );
        })}
        {reactions.length > 0 && (
          <Overlay
            onContextMenu={(evt: any) => {
              evt.stopPropagation();
            }}
            open={!!viewer}
            backdrop={<OverlayBackdrop />}
          >
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setViewer(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal variant="Surface" size="300">
                  <ReactionViewer
                    room={room}
                    initialKey={typeof viewer === 'string' ? viewer : undefined}
                    reactions={reactions}
                    requestClose={() => setViewer(false)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
      </Box>
    );
  }
);
