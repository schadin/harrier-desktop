import React, {
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Editor } from 'slate';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';
import type { RoomView } from '@harrier/core';
import { useCore } from '../../../hooks/useCore';
import { useCoreRoom } from '../../../hooks/useCoreRoom';
import { useCoreSession } from '../../../hooks/useCoreSession';

import { createMentionElement, moveCursor, replaceWithElement } from '../utils';
import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import { getMxIdServer, isRoomAlias } from '../../../utils/matrix';
import { UseAsyncSearchOptions, useAsyncSearch } from '../../../hooks/useAsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { useKeyDown } from '../../../hooks/useKeyDown';
import { RoomAvatar, RoomIcon } from '../../room-avatar';
import { getViaServers } from '../../../plugins/via-servers';
import { toMediaRef, useMediaSource } from '../../../utils/coreMedia';
import { JoinRule } from '../../../../types/matrix/legacyStructural';

type MentionAutoCompleteHandler = (roomAliasOrId: string, name: string) => void;

const roomAliasFromQueryText = (myUserId: string | null | undefined, text: string) =>
  isRoomAlias(`#${text}`)
    ? `#${text}`
    : `#${text}${text.endsWith(':') ? '' : ':'}${getMxIdServer(myUserId ?? '')}`;

function MentionRoomAvatar({ room }: { room: RoomView }) {
  const avatarMxc = room.isDirect ? room.dmAvatarMxc ?? room.avatarMxc : room.avatarMxc;
  const avatarUrl = useMediaSource(
    avatarMxc ? toMediaRef(avatarMxc, { width: 32, height: 32, resizeMethod: 'crop' }) : undefined
  );

  return (
    <RoomAvatar
      roomId={room.roomId}
      src={avatarUrl}
      alt={room.name}
      renderFallback={() => (
        <RoomIcon
          size={room.isDirect ? '50' : '100'}
          joinRule={room.isDirect ? room.joinRule ?? JoinRule.Restricted : room.joinRule}
          roomType={room.roomType}
          filled={room.isDirect || undefined}
        />
      )}
    />
  );
}

function UnknownRoomMentionItem({
  query,
  handleAutocomplete,
}: {
  query: AutocompleteQuery<string>;
  handleAutocomplete: MentionAutoCompleteHandler;
}) {
  const session = useCoreSession();
  const roomAlias: string = roomAliasFromQueryText(session?.userId, query.text);

  const handleSelect = () => handleAutocomplete(roomAlias, roomAlias);

  return (
    <MenuItem
      as="button"
      radii="300"
      onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) => onTabPress(evt, handleSelect)}
      onClick={handleSelect}
      before={
        <Avatar size="200">
          <Icon src={Icons.Hash} size="100" />
        </Avatar>
      }
    >
      <Text style={{ flexGrow: 1 }} size="B400">
        {roomAlias}
      </Text>
    </MenuItem>
  );
}

type RoomMentionAutocompleteProps = {
  roomId: string;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

const getRoomSearchStr = (room: RoomView): string | string[] =>
  room.canonicalAlias ? [room.name, room.canonicalAlias] : room.name;

export function RoomMentionAutocomplete({
  roomId,
  editor,
  query,
  requestClose,
}: RoomMentionAutocompleteProps) {
  const core = useCore();
  const session = useCoreSession();
  const currentRoom = useCoreRoom(roomId);
  const roomListStore = core.rooms.list;
  const roomSummaries = useSyncExternalStore(
    roomListStore.subscribe,
    roomListStore.getSnapshot,
    roomListStore.getSnapshot
  ).value;
  const allRooms = useMemo(
    () =>
      roomSummaries
        .map((summary) => core.rooms.room(summary.roomId).getSnapshot().value)
        .filter((room): room is RoomView => room !== null),
    [core, roomSummaries]
  );

  const [result, search, resetSearch] = useAsyncSearch(allRooms, getRoomSearchStr, SEARCH_OPTIONS);

  const autoCompleteRooms = result ? result.items.slice(0, 20) : allRooms.slice(0, 20);

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: MentionAutoCompleteHandler = (roomAliasOrId, name) => {
    const mentionRoom = core.rooms.room(roomAliasOrId).getSnapshot().value;
    const viaServers = mentionRoom ? getViaServers(core, mentionRoom.roomId) : undefined;
    const mentionEl = createMentionElement(
      roomAliasOrId,
      name.startsWith('#') ? name : `#${name}`,
      roomId === roomAliasOrId || currentRoom?.canonicalAlias === roomAliasOrId,
      undefined,
      viaServers
    );
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteRooms.length === 0) {
        const alias = roomAliasFromQueryText(session?.userId, query.text);
        handleAutocomplete(alias, alias);
        return;
      }
      const room = autoCompleteRooms[0];
      handleAutocomplete(room.canonicalAlias ?? room.roomId, room.name);
    });
  });

  return (
    <AutocompleteMenu headerContent={<Text size="L400">Rooms</Text>} requestClose={requestClose}>
      {autoCompleteRooms.length === 0 ? (
        <UnknownRoomMentionItem query={query} handleAutocomplete={handleAutocomplete} />
      ) : (
        autoCompleteRooms.map((room) => {
          const handleSelect = () =>
            handleAutocomplete(room.canonicalAlias ?? room.roomId, room.name);

          return (
            <MenuItem
              key={room.roomId}
              as="button"
              radii="300"
              onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                onTabPress(evt, handleSelect)
              }
              onClick={handleSelect}
              after={
                <Text size="T200" priority="300" truncate>
                  {room.canonicalAlias ?? ''}
                </Text>
              }
              before={
                <Avatar size="200">
                  <MentionRoomAvatar room={room} />
                </Avatar>
              }
            >
              <Text style={{ flexGrow: 1 }} size="B400" truncate>
                {room.name}
              </Text>
            </MenuItem>
          );
        })
      )}
    </AutocompleteMenu>
  );
}
