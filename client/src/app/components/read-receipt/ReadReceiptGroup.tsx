import React, { useState } from 'react';
import classNames from 'classnames';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter, as } from 'folds';
import { Room } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { UserAvatar } from '../user-avatar';
import { EventReaders } from '../event-readers';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './ReadReceiptGroup.css';

const MAX_VISIBLE_AVATARS = 3;

export type ReadReceiptGroupProps = {
  room: Room;
  eventId: string;
  userIds: string[];
};

export const ReadReceiptGroup = as<'button', ReadReceiptGroupProps>(
  ({ className, room, eventId, userIds, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [open, setOpen] = useState(false);

    const getName = (userId: string) =>
      getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;

    const visibleUsers = userIds.slice(0, MAX_VISIBLE_AVATARS);
    const hiddenCount = userIds.length - visibleUsers.length;

    return (
      <>
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
                <EventReaders room={room} eventId={eventId} requestClose={() => setOpen(false)} />
              </Modal>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
        <button
          type="button"
          className={classNames(css.ReadReceiptGroup, className)}
          onClick={() => setOpen(true)}
          title={userIds.map(getName).join(', ')}
          {...props}
          ref={ref}
        >
          {visibleUsers.map((userId) => {
            const name = getName(userId);
            const avatarMxcUrl = room.getMember(userId)?.getMxcAvatarUrl();
            const avatarUrl = avatarMxcUrl
              ? mx.mxcUrlToHttp(avatarMxcUrl, 32, 32, 'crop', undefined, false, useAuthentication)
              : undefined;

            return (
              <span key={userId} className={css.AvatarWrap}>
                <UserAvatar
                  userId={userId}
                  src={avatarUrl ?? undefined}
                  alt={name}
                  renderFallback={() => <span className={css.AvatarLetter}>{name.charAt(0)}</span>}
                />
              </span>
            );
          })}
          {hiddenCount > 0 && <span className={css.MoreAvatar}>{`+${hiddenCount}`}</span>}
        </button>
      </>
    );
  }
);
