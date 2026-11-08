import React, { ReactNode } from 'react';
import { IconSrc, Icons } from 'folds';
import type { TimelineItem } from '@harrier/core';
import { IMemberContent, Membership } from '../../types/matrix/room';
import { getMxIdLocalPart } from '../utils/matrix';
import { isMembershipContentChanged } from '../utils/room';

export type ParsedResult = {
  icon: IconSrc;
  body: ReactNode;
};

export type StateTimelineItem = Extract<TimelineItem, { kind: 'state' }>;

export type MemberEventParser = (item: StateTimelineItem) => ParsedResult;

export const useMemberEventParser = (): MemberEventParser => {
  const parseMemberEvent: MemberEventParser = (item) => {
    const content = item.content as IMemberContent;
    const prevContent = (item.prevContent ?? {}) as IMemberContent;
    const senderId = item.sender;
    const userId = item.stateKey;
    const reason = typeof content.reason === 'string' ? content.reason : undefined;

    if (!senderId || !userId)
      return {
        icon: Icons.User,
        body: 'Broken membership event',
      };

    const senderName = getMxIdLocalPart(senderId);
    const userName =
      typeof content.displayname === 'string'
        ? content.displayname || getMxIdLocalPart(userId)
        : getMxIdLocalPart(userId);

    if (isMembershipContentChanged(content, prevContent)) {
      if (content.membership === Membership.Invite) {
        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightPlus,
            body: (
              <>
                <b>{senderName}</b>
                {' accepted '}
                <b>{userName}</b>
                {`'s join request `}
                {reason}
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <b>{senderName}</b>
              {' invited '}
              <b>{userName}</b> {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Knock) {
        return {
          icon: Icons.ArrowGoRightPlus,
          body: (
            <>
              <b>{userName}</b>
              {' request to join room '}
              {reason}
            </>
          ),
        };
      }

      if (content.membership === Membership.Join) {
        return {
          icon: Icons.ArrowGoRight,
          body: (
            <>
              <b>{userName}</b>
              {' joined the room'}
            </>
          ),
        };
      }

      if (content.membership === Membership.Leave) {
        if (prevContent.membership === Membership.Invite) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <b>{userName}</b>
                  {' rejected the invitation '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' rejected '}
                  <b>{userName}</b>
                  {`'s join request `}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Knock) {
          return {
            icon: Icons.ArrowGoRightCross,
            body:
              senderId === userId ? (
                <>
                  <b>{userName}</b>
                  {' revoked joined request '}
                  {reason}
                </>
              ) : (
                <>
                  <b>{senderName}</b>
                  {' revoked '}
                  <b>{userName}</b>
                  {`'s invite `}
                  {reason}
                </>
              ),
          };
        }

        if (prevContent.membership === Membership.Ban) {
          return {
            icon: Icons.ArrowGoLeft,
            body: (
              <>
                <b>{senderName}</b>
                {' unbanned '}
                <b>{userName}</b> {reason}
              </>
            ),
          };
        }

        return {
          icon: Icons.ArrowGoLeft,
          body:
            senderId === userId ? (
              <>
                <b>{userName}</b>
                {' left the room '}
                {reason}
              </>
            ) : (
              <>
                <b>{senderName}</b>
                {' kicked '}
                <b>{userName}</b> {reason}
              </>
            ),
        };
      }

      if (content.membership === Membership.Ban) {
        return {
          icon: Icons.ArrowGoLeft,
          body: (
            <>
              <b>{senderName}</b>
              {' banned '}
              <b>{userName}</b> {reason}
            </>
          ),
        };
      }
    }

    if (content.displayname !== prevContent.displayname) {
      const prevUserName =
        typeof prevContent.displayname === 'string'
          ? prevContent.displayname || getMxIdLocalPart(userId)
          : getMxIdLocalPart(userId);

      return {
        icon: Icons.Mention,
        body:
          typeof content.displayname === 'string' ? (
            <>
              <b>{prevUserName}</b>
              {' changed display name to '}
              <b>{userName}</b>
            </>
          ) : (
            <>
              <b>{prevUserName}</b>
              {' removed their display name '}
            </>
          ),
      };
    }
    if (content.avatar_url !== prevContent.avatar_url) {
      return {
        icon: Icons.User,
        body:
          content.avatar_url && typeof content.avatar_url === 'string' ? (
            <>
              <b>{userName}</b>
              {' changed their avatar'}
            </>
          ) : (
            <>
              <b>{userName}</b>
              {' removed their avatar '}
            </>
          ),
      };
    }

    return {
      icon: Icons.User,
      body: 'Membership event with no changes',
    };
  };

  return parseMemberEvent;
};
