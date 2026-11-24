import React, { useState } from 'react';
import classNames from 'classnames';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter, as } from 'folds';
import type { MemberView } from '@harrier/core';
import FocusTrap from 'focus-trap-react';
import { getMxIdLocalPart } from '../../utils/matrix';
import { UserAvatar } from '../user-avatar';
import { EventReaders } from '../event-readers';
import { stopPropagation } from '../../utils/keyboard';
import { toMediaRef, useMediaSource } from '../../utils/coreMedia';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import * as css from './ReadReceiptGroup.css';

const MAX_VISIBLE_AVATARS = 3;

type ReceiptAvatarProps = {
  userId: string;
  avatarMxc: string | undefined;
  name: string;
};

function ReceiptAvatar({ userId, avatarMxc, name }: ReceiptAvatarProps) {
  const avatarUrl = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 32, height: 32, resizeMethod: 'crop' }) : undefined
  );

  return (
    <UserAvatar
      userId={userId}
      src={avatarUrl}
      alt={name}
      renderFallback={() => <span className={css.AvatarLetter}>{name.charAt(0)}</span>}
    />
  );
}

export type ReadReceiptGroupProps = {
  roomId: string;
  eventId: string;
  userIds: string[];
};

export const ReadReceiptGroup = as<'button', ReadReceiptGroupProps>(
  ({ className, roomId, eventId, userIds, ...props }, ref) => {
    const [open, setOpen] = useState(false);
    const roomMembers = useRoomMembers(roomId);
    const memberById = new Map<string, MemberView>(
      roomMembers.map((member) => [member.userId, member])
    );

    const getName = (userId: string) => {
      const member = memberById.get(userId);
      return member?.rawDisplayName !== undefined && member.rawDisplayName !== userId
        ? member.rawDisplayName
        : getMxIdLocalPart(userId) ?? userId;
    };

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
                <EventReaders
                  roomId={roomId}
                  eventId={eventId}
                  requestClose={() => setOpen(false)}
                />
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
            const avatarMxcUrl = memberById.get(userId)?.avatarMxc;

            return (
              <span key={userId} className={css.AvatarWrap}>
                <ReceiptAvatar userId={userId} avatarMxc={avatarMxcUrl} name={name} />
              </span>
            );
          })}
          {hiddenCount > 0 && <span className={css.MoreAvatar}>{`+${hiddenCount}`}</span>}
        </button>
      </>
    );
  }
);
