import React, { ReactNode } from 'react';
import { as, Avatar, Box, Icon, Icons, Text } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import type { MemberView } from '@harrier/core';
import { getMxIdLocalPart } from '../../utils/matrix';
import { UserAvatar } from '../user-avatar';
import * as css from './style.css';

const getName = (member: MemberView) =>
  member.rawDisplayName !== undefined && member.rawDisplayName !== member.userId
    ? member.rawDisplayName
    : getMxIdLocalPart(member.userId) ?? member.userId;

type MemberTileProps = {
  mx: MatrixClient;
  member: MemberView;
  useAuthentication: boolean;
  after?: ReactNode;
};
export const MemberTile = as<'button', MemberTileProps>(
  ({ as: AsMemberTile = 'button', mx, member, useAuthentication, after, ...props }, ref) => {
    const name = getName(member);
    const username = getMxIdLocalPart(member.userId);

    const avatarMxcUrl = member.avatarMxc;
    const avatarUrl = avatarMxcUrl
      ? mx.mxcUrlToHttp(avatarMxcUrl, 100, 100, 'crop', undefined, false, useAuthentication)
      : undefined;

    return (
      <AsMemberTile className={css.MemberTile} {...props} ref={ref}>
        <Avatar size="300" radii="400">
          <UserAvatar
            userId={member.userId}
            src={avatarUrl ?? undefined}
            alt={name}
            renderFallback={() => <Icon size="300" src={Icons.User} filled />}
          />
        </Avatar>
        <Box grow="Yes" as="span" direction="Column">
          <Text as="span" size="T300" truncate>
            <b>{name}</b>
          </Text>
          <Box alignItems="Center" justifyContent="SpaceBetween" gap="100">
            <Text as="span" size="T200" priority="300" truncate>
              {username}
            </Text>
          </Box>
        </Box>
        {after}
      </AsMemberTile>
    );
  }
);
