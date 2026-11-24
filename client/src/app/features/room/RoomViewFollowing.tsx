import React, { useState } from 'react';
import {
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  as,
  config,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';

import { getMxIdLocalPart } from '../../utils/matrix';
import * as css from './RoomViewFollowing.css';
import { useCoreSession } from '../../hooks/useCoreSession';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { useRoomLatestRenderedEvent } from '../../hooks/useRoomLatestRenderedEvent';
import { useRoomEventReaders } from '../../hooks/useRoomEventReaders';
import { EventReaders } from '../../components/event-readers';
import { stopPropagation } from '../../utils/keyboard';

export function RoomViewFollowingPlaceholder() {
  return <div className={css.RoomViewFollowingPlaceholder} />;
}

export type RoomViewFollowingProps = {
  roomId: string;
};
export const RoomViewFollowing = as<'div', RoomViewFollowingProps>(
  ({ className, roomId, ...props }, ref) => {
    const session = useCoreSession();
    const members = useRoomMembers(roomId);
    const [open, setOpen] = useState(false);
    const latestEvent = useRoomLatestRenderedEvent({ roomId });
    const latestEventReaders = useRoomEventReaders(roomId, latestEvent?.eventId);
    const names = latestEventReaders
      .filter((readerId) => readerId !== session?.userId)
      .map((readerId) => {
        const rawDisplayName = members.find((member) => member.userId === readerId)?.rawDisplayName;
        return rawDisplayName !== undefined && rawDisplayName !== readerId
          ? rawDisplayName
          : getMxIdLocalPart(readerId) ?? readerId;
      });

    const eventId = latestEvent?.eventId;

    return (
      <>
        {eventId && (
          <Overlay open={open} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setOpen(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal variant="Surface" size="300">
                  <EventReaders
                    roomId={roomId}
                    eventId={eventId}
                    requestClose={() => setOpen(false)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
        <Box
          as={names.length > 0 ? 'button' : 'div'}
          onClick={names.length > 0 ? () => setOpen(true) : undefined}
          className={classNames(css.RoomViewFollowing({ clickable: names.length > 0 }), className)}
          alignItems="Center"
          justifyContent="End"
          gap="200"
          {...props}
          ref={ref}
        >
          {names.length > 0 && (
            <>
              <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.CheckTwice} />
              <Text size="T300" truncate>
                {names.length === 1 && (
                  <>
                    <b>{names[0]}</b>
                    <Text as="span" size="Inherit" priority="300">
                      {' is following the conversation.'}
                    </Text>
                  </>
                )}
                {names.length === 2 && (
                  <>
                    <b>{names[0]}</b>
                    <Text as="span" size="Inherit" priority="300">
                      {' and '}
                    </Text>
                    <b>{names[1]}</b>
                    <Text as="span" size="Inherit" priority="300">
                      {' are following the conversation.'}
                    </Text>
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
                    <Text as="span" size="Inherit" priority="300">
                      {' are following the conversation.'}
                    </Text>
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
                    <Text as="span" size="Inherit" priority="300">
                      {' are following the conversation.'}
                    </Text>
                  </>
                )}
              </Text>
            </>
          )}
        </Box>
      </>
    );
  }
);
