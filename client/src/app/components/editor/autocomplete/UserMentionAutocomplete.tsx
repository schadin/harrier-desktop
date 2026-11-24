import React, { useEffect, useMemo, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Editor } from 'slate';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';

import type { MemberView } from '@harrier/core';
import { getMemberSearchStr } from '@harrier/core';

import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import { useRoomMembers } from '../../../hooks/useRoomMembers';
import { useCoreRoom } from '../../../hooks/useCoreRoom';
import { useCoreSession } from '../../../hooks/useCoreSession';
import {
  SearchItemStrGetter,
  UseAsyncSearchOptions,
  useAsyncSearch,
} from '../../../hooks/useAsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { createMentionElement, moveCursor, replaceWithElement } from '../utils';
import { useKeyDown } from '../../../hooks/useKeyDown';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../../utils/matrix';
import { UserAvatar } from '../../user-avatar';
import { toMediaRef, useMediaSource } from '../../../utils/coreMedia';
import { Membership } from '../../../../types/matrix/room';

type MentionAutoCompleteHandler = (userId: string, name: string) => void;

const userIdFromQueryText = (myUserId: string | null | undefined, text: string) =>
  isUserId(`@${text}`)
    ? `@${text}`
    : `@${text}${text.endsWith(':') ? '' : ':'}${getMxIdServer(myUserId ?? '')}`;

const getName = (member: MemberView) =>
  member.rawDisplayName !== undefined && member.rawDisplayName !== member.userId
    ? member.rawDisplayName
    : getMxIdLocalPart(member.userId) ?? member.userId;

function MentionMemberAvatar({ member }: { member: MemberView }) {
  const avatarUrl = useMediaSource(
    member.avatarMxc
      ? toMediaRef(member.avatarMxc, { width: 32, height: 32, resizeMethod: 'crop' })
      : undefined
  );

  return (
    <UserAvatar
      userId={member.userId}
      src={avatarUrl}
      alt={getName(member)}
      renderFallback={() => <Icon size="50" src={Icons.User} filled />}
    />
  );
}

function UnknownMentionItem({
  userId,
  name,
  handleAutocomplete,
}: {
  userId: string;
  name: string;
  handleAutocomplete: MentionAutoCompleteHandler;
}) {
  return (
    <MenuItem
      as="button"
      radii="300"
      onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
        onTabPress(evt, () => handleAutocomplete(userId, name))
      }
      onClick={() => handleAutocomplete(userId, name)}
      before={
        <Avatar size="200">
          <UserAvatar
            userId={userId}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
      }
    >
      <Text style={{ flexGrow: 1 }} size="B400">
        {name}
      </Text>
    </MenuItem>
  );
}

type UserMentionAutocompleteProps = {
  roomId: string;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const withAllowedMembership = (member: MemberView): boolean =>
  member.membership === Membership.Join ||
  member.membership === Membership.Invite ||
  member.membership === Membership.Knock;

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const mxIdToName = (mxId: string) => getMxIdLocalPart(mxId) ?? mxId;
const getRoomMemberStr: SearchItemStrGetter<MemberView> = (m, query) =>
  getMemberSearchStr(m, query, mxIdToName);

export function UserMentionAutocomplete({
  roomId,
  editor,
  query,
  requestClose,
}: UserMentionAutocompleteProps) {
  const session = useCoreSession();
  const room = useCoreRoom(roomId);
  const roomAliasOrId = room?.canonicalAlias || roomId;
  const members = useRoomMembers(roomId);
  const memberList = useMemo(() => [...members], [members]);

  const [result, search, resetSearch] = useAsyncSearch(
    memberList,
    getRoomMemberStr,
    SEARCH_OPTIONS
  );
  const autoCompleteMembers = (result ? result.items.slice(0, 20) : memberList.slice(0, 20)).filter(
    withAllowedMembership
  );

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: MentionAutoCompleteHandler = (uId, name) => {
    const mentionEl = createMentionElement(
      uId,
      name.startsWith('@') ? name : `@${name}`,
      session?.userId === uId || roomAliasOrId === uId
    );
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (query.text === 'room') {
        handleAutocomplete(roomAliasOrId, '@room');
        return;
      }
      if (autoCompleteMembers.length === 0) {
        const userId = userIdFromQueryText(session?.userId, query.text);
        handleAutocomplete(userId, userId);
        return;
      }
      const roomMember = autoCompleteMembers[0];
      handleAutocomplete(roomMember.userId, roomMember.displayName);
    });
  });

  return (
    <AutocompleteMenu headerContent={<Text size="L400">Mentions</Text>} requestClose={requestClose}>
      {query.text === 'room' && (
        <UnknownMentionItem
          userId={roomAliasOrId}
          name="@room"
          handleAutocomplete={handleAutocomplete}
        />
      )}
      {autoCompleteMembers.length === 0 ? (
        <UnknownMentionItem
          userId={userIdFromQueryText(session?.userId, query.text)}
          name={userIdFromQueryText(session?.userId, query.text)}
          handleAutocomplete={handleAutocomplete}
        />
      ) : (
        autoCompleteMembers.map((roomMember) => (
          <MenuItem
            key={roomMember.userId}
            as="button"
            radii="300"
            onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
              onTabPress(evt, () => handleAutocomplete(roomMember.userId, getName(roomMember)))
            }
            onClick={() => handleAutocomplete(roomMember.userId, getName(roomMember))}
            after={
              <Text size="T200" priority="300" truncate>
                {roomMember.userId}
              </Text>
            }
            before={
              <Avatar size="200">
                <MentionMemberAvatar member={roomMember} />
              </Avatar>
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              {getName(roomMember)}
            </Text>
          </MenuItem>
        ))
      )}
    </AutocompleteMenu>
  );
}
