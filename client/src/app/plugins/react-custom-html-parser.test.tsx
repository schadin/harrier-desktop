import React from 'react';
import {
  createSnapshotStore,
  type HarrierCore,
  type MemberView,
  type RoomView,
} from '@harrier/core';
import parse from 'html-react-parser';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StateEvent } from '../../types/matrix/room';
import * as css from '../styles/CustomHtml.css';
import {
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  renderMatrixMention,
} from './react-custom-html-parser';

const CURRENT_USER_ID = '@me:example.org';
const GENERAL_ROOM_ID = '!general:example.org';
const GENERAL_ALIAS = '#general:example.org';

const makeRoom = (
  roomId: string,
  name: string,
  canonicalAlias?: string,
  membership: RoomView['membership'] = 'join'
): RoomView => ({
  roomId,
  name,
  lastActiveTimestamp: Number.MIN_SAFE_INTEGER,
  canonicalAlias,
  membership,
  isDirect: false,
  isSpace: false,
  encrypted: false,
  viaServers: ['example.org'],
  spaceChildren: [],
});

const makeMember = (userId: string, rawDisplayName: string): MemberView => ({
  userId,
  rawDisplayName,
  displayName: rawDisplayName,
  membership: 'join',
  powerLevel: 0,
});

const makeCore = ({
  rooms = [],
  members = [],
  tombstonedRoomIds = [],
  mediaUrl = () => null,
}: {
  rooms?: RoomView[];
  members?: MemberView[];
  tombstonedRoomIds?: string[];
  mediaUrl?: HarrierCore['media']['url'];
} = {}): HarrierCore => {
  const roomById = new Map(rooms.map((room) => [room.roomId, room]));
  const tombstoned = new Set(tombstonedRoomIds);

  return {
    auth: {
      session: createSnapshotStore({
        userId: CURRENT_USER_ID,
        deviceId: 'DEVICE',
        ready: true,
      }),
    },
    rooms: {
      all: createSnapshotStore(rooms),
      list: createSnapshotStore(rooms.filter((room) => room.membership === 'join')),
      room: (roomId: string) => createSnapshotStore(roomById.get(roomId) ?? null),
      members: () => createSnapshotStore(members),
      stateEntry: (roomId: string, eventType: string) =>
        createSnapshotStore(
          tombstoned.has(roomId) && eventType === StateEvent.RoomTombstone
            ? { stateKey: '', content: { replacement_room: GENERAL_ROOM_ID } }
            : null
        ),
    },
    media: { url: mediaUrl },
  } as unknown as HarrierCore;
};

describe('renderMatrixMention', () => {
  it('highlights the current user and reads the member display name from core', () => {
    const core = makeCore({
      rooms: [makeRoom(GENERAL_ROOM_ID, 'General', GENERAL_ALIAS)],
      members: [makeMember(CURRENT_USER_ID, 'My display name')],
    });

    const mention = renderMatrixMention(
      core,
      GENERAL_ROOM_ID,
      `https://matrix.to/#/${CURRENT_USER_ID}`,
      {}
    );

    expect(mention?.props).toMatchObject({
      href: `https://matrix.to/#/${CURRENT_USER_ID}`,
      className: css.Mention({ highlight: true }),
      'data-mention-id': CURRENT_USER_ID,
      children: '@My display name',
    });
  });

  it('falls back to the user localpart when the member has no distinct raw display name', () => {
    const core = makeCore({
      rooms: [makeRoom(GENERAL_ROOM_ID, 'General', GENERAL_ALIAS)],
      members: [makeMember('@alice:example.org', '@alice:example.org')],
    });

    const mention = renderMatrixMention(
      core,
      GENERAL_ROOM_ID,
      'https://matrix.to/#/@alice:example.org',
      {}
    );

    expect(mention?.props.children).toBe('@alice');
    expect(mention?.props.className).toBe(css.Mention({ highlight: false }));
  });

  it('resolves room aliases through core snapshots and preserves via and highlight data', () => {
    const core = makeCore({
      rooms: [
        makeRoom('!old:example.org', 'Old General', GENERAL_ALIAS),
        makeRoom(GENERAL_ROOM_ID, 'General', GENERAL_ALIAS),
      ],
      tombstonedRoomIds: ['!old:example.org'],
    });

    const mention = renderMatrixMention(
      core,
      GENERAL_ROOM_ID,
      `https://matrix.to/#/${GENERAL_ALIAS}?via=one.example.org&via=two.example.org`,
      {}
    );

    expect(mention?.props).toMatchObject({
      className: css.Mention({ highlight: true }),
      'data-mention-id': GENERAL_ROOM_ID,
      'data-mention-via': 'one.example.org,two.example.org',
      children: '#General',
    });
  });

  it('resolves aliases for known invited rooms outside the joined room list', () => {
    const invitedRoomId = '!invited:example.org';
    const core = makeCore({
      rooms: [makeRoom(invitedRoomId, 'Invited General', GENERAL_ALIAS, 'invite')],
    });

    const mention = renderMatrixMention(
      core,
      invitedRoomId,
      `https://matrix.to/#/${GENERAL_ALIAS}?via=via.example.org`,
      {}
    );

    expect(mention?.props).toMatchObject({
      className: css.Mention({ highlight: true }),
      'data-mention-id': invitedRoomId,
      'data-mention-via': 'via.example.org',
      children: '#Invited General',
    });
  });

  it('keeps an unknown room alias and its via servers as fallback mention data', () => {
    const core = makeCore();

    const mention = renderMatrixMention(
      core,
      GENERAL_ROOM_ID,
      'https://matrix.to/#/#missing:example.org?via=via.example.org',
      {}
    );

    expect(mention?.props).toMatchObject({
      className: css.Mention({ highlight: false }),
      'data-mention-id': '#missing:example.org',
      'data-mention-via': 'via.example.org',
      children: '#missing:example.org',
    });
  });

  it('resolves event aliases and preserves the event id, via servers and fallback text', () => {
    const core = makeCore({
      rooms: [makeRoom(GENERAL_ROOM_ID, 'General', GENERAL_ALIAS)],
    });

    const mention = renderMatrixMention(
      core,
      GENERAL_ROOM_ID,
      `https://matrix.to/#/${GENERAL_ALIAS}/$event?via=via.example.org`,
      {}
    );

    expect(mention?.props).toMatchObject({
      className: css.Mention({ highlight: true }),
      'data-mention-id': GENERAL_ROOM_ID,
      'data-mention-event-id': '$event',
      'data-mention-via': 'via.example.org',
      children: 'Message: #General',
    });
  });
});

describe('getReactCustomHtmlParser images', () => {
  it('resolves MXC image sources through core media with authentication options', () => {
    const mediaUrl = vi.fn(() => 'https://media.example.org/image.png');
    const core = makeCore({ mediaUrl });
    const options = getReactCustomHtmlParser(core, GENERAL_ROOM_ID, {
      linkifyOpts: LINKIFY_OPTS,
      useAuthentication: true,
    });

    const markup = renderToStaticMarkup(
      <>{parse('<img src="mxc://example.org/image" alt="Picture" />', options)}</>
    );

    expect(mediaUrl).toHaveBeenCalledWith(
      { mxcUrl: 'mxc://example.org/image' },
      { useAuthentication: true }
    );
    expect(markup).toMatch(/^<img /);
    expect(markup).toContain('src="https://media.example.org/image.png"');
    expect(markup).toContain('alt="Picture"');
  });

  it('defaults omitted image authentication options to unauthenticated media URLs', () => {
    const mediaUrl = vi.fn(() => 'https://media.example.org/image.png');
    const core = makeCore({ mediaUrl });
    const options = getReactCustomHtmlParser(core, GENERAL_ROOM_ID, {
      linkifyOpts: LINKIFY_OPTS,
    });

    const markup = renderToStaticMarkup(
      <>{parse('<img src="mxc://example.org/image" alt="Picture" />', options)}</>
    );

    expect(mediaUrl).toHaveBeenCalledWith(
      { mxcUrl: 'mxc://example.org/image' },
      { useAuthentication: false }
    );
    expect(markup).toContain('src="https://media.example.org/image.png"');
  });

  it('keeps non-MXC image sources unchanged without calling core media', () => {
    const mediaUrl = vi.fn(() => null);
    const core = makeCore({ mediaUrl });
    const options = getReactCustomHtmlParser(core, GENERAL_ROOM_ID, {
      linkifyOpts: LINKIFY_OPTS,
      useAuthentication: false,
    });

    const markup = renderToStaticMarkup(
      <>{parse('<img src="https://example.org/image.png" alt="Picture" />', options)}</>
    );

    expect(mediaUrl).not.toHaveBeenCalled();
    expect(markup).toBe('<img src="https://example.org/image.png" alt="Picture"/>');
  });
});
