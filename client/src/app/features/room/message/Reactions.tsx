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
import type { ReactionCountView } from '@harrier/core';
import FocusTrap from 'focus-trap-react';
import { useCoreSession } from '../../../hooks/useCoreSession';
import { Reaction, ReactionTooltipMsg } from '../../../components/message';
import * as css from './styles.css';
import { ReactionViewer } from '../reaction-viewer';
import { stopPropagation } from '../../../utils/keyboard';

export type ReactionsProps = {
  roomId: string;
  mEventId: string;
  canSendReaction?: boolean;
  reactions: readonly ReactionCountView[];
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
};
export const Reactions = as<'div', ReactionsProps>(
  (
    { className, roomId, reactions, mEventId, canSendReaction, onReactionToggle, ...props },
    ref
  ) => {
    const session = useCoreSession();
    const [viewer, setViewer] = useState<boolean | string>(false);
    const myUserId = session?.userId ?? null;

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
                      roomId={roomId}
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
                  reaction={key}
                  count={count}
                  onClick={
                    canSendReaction ? () => onReactionToggle(mEventId, key, shortcode) : undefined
                  }
                  onContextMenu={handleViewReaction}
                  aria-disabled={!canSendReaction}
                />
              )}
            </TooltipProvider>
          );
        })}
        {reactions.length > 0 && (
          <Overlay
            onContextMenu={(evt: React.MouseEvent<HTMLElement>) => {
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
                    roomId={roomId}
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
