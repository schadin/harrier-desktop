import type {
  HarrierCore,
  MemberView,
  RoomView,
  TimelineItem,
  TimelineView,
  UserProfileView,
} from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { RoomToUnread } from '../../../../types/matrix/room';
import { PaletteCategory, PaletteItem } from './types';
import { buildUnreadPaletteItems, matchUnreadItem, UNREAD_LIST_LIMIT } from './unread';

const labels = {
  image: '[Photo]',
  video: '[Video]',
  audio: '[Audio]',
  file: '[File]',
  sticker: '[Sticker]',
  redacted: '[Deleted message]',
  encrypted: '[Encrypted message]',
};

const makeRoom = (roomId: string, lastActiveTimestamp = 0): RoomView => ({
  roomId,
  name: 'Room',
  lastActiveTimestamp,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
});

const message = (
  eventId: string,
  sender: string,
  body: string,
  msgtype = 'm.text'
): TimelineItem => ({
  kind: 'message',
  eventId,
  roomId: '!a:example.org',
  sender,
  timestamp: 10,
  preview: body,
  status: 'sent',
  content: { msgtype, body, raw: { msgtype, body } },
});

const makeTimeline = (
  items: readonly TimelineItem[],
  readUpTo?: string,
  roomId = '!a:example.org'
): TimelineView => ({
  roomId,
  items,
  hasBackwardHistory: false,
  ...(readUpTo ? { readUpTo } : {}),
});

const makeMember = (userId: string, displayName: string): MemberView => ({
  userId,
  displayName,
  membership: 'join',
  powerLevel: 0,
});

const makeCore = (
  rooms: Record<string, RoomView>,
  timelines: Record<string, TimelineView> = {},
  members: Record<string, readonly MemberView[]> = {},
  profiles: Record<string, UserProfileView> = {}
): HarrierCore => {
  const roomStores = new Map(
    Object.entries(rooms).map(([roomId, room]) => [roomId, createSnapshotStore(room)])
  );
  const timelineStores = new Map(
    Object.entries(timelines).map(([roomId, timeline]) => [roomId, createSnapshotStore(timeline)])
  );
  const emptyTimeline = (roomId: string) =>
    timelineStores.get(roomId) ??
    createSnapshotStore<TimelineView>({
      roomId,
      items: [],
      hasBackwardHistory: false,
    });
  const emptyMembers = createSnapshotStore<readonly MemberView[]>([]);
  return {
    auth: {
      session: createSnapshotStore({ userId: '@me:example.org', deviceId: 'DEVICE', ready: true }),
    },
    rooms: {
      room(roomId: string) {
        return roomStores.get(roomId) ?? createSnapshotStore<RoomView | null>(null);
      },
      members(roomId: string) {
        const store = members[roomId] ? createSnapshotStore(members[roomId]) : emptyMembers;
        return store;
      },
    },
    timeline: {
      timeline: emptyTimeline,
    },
    presence: {
      profile(userId: string) {
        return createSnapshotStore<UserProfileView>(profiles[userId] ?? { userId });
      },
    },
  } as unknown as HarrierCore;
};

const makeRoomItem = (roomId: string, title = roomId): PaletteItem => ({
  id: `room:${roomId}`,
  category: PaletteCategory.Rooms,
  title,
  keywords: [roomId],
  roomId,
  run: () => undefined,
});

const unread = (total = 1, highlight = 0): RoomToUnread =>
  new Map([['!a:example.org', { total, highlight, from: null }]]);

describe('getUnreadPreview через buildUnreadPaletteItems', () => {
  it('показывает первое непрочитанное сообщение с отправителем', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline(
          [message('e1', '@bob:example.org', 'Hi'), message('e2', '@al:example.org', 'Yo')],
          'e1'
        ),
      },
      { [room.roomId]: [makeMember('@al:example.org', 'Al')] }
    );

    const result = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);

    expect(result).toHaveLength(1);
    expect(result[0].item.preview).toBe('Al: Yo');
  });

  it('медиа показывает плейсхолдер вместо тела', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline([message('e1', '@bob:example.org', 'image.png', 'm.image')]),
      }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('bob: [Photo]');
  });

  it('без read receipt показывает с начала core timeline', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline([
          {
            kind: 'state',
            eventId: 'e0',
            roomId: room.roomId,
            sender: '@bob:example.org',
            timestamp: 1,
            preview: 'm.room.member',
            eventType: 'm.room.member',
            stateKey: '@bob:example.org',
            content: {},
          },
          message('e1', '@bob:example.org', 'First'),
        ]),
      }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('bob: First');
  });

  it('пропускает свои сообщения и берёт первое входящее', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline(
          [message('e1', '@me:example.org', 'My own'), message('e2', '@al:example.org', 'Reply')],
          'e0'
        ),
      },
      { [room.roomId]: [makeMember('@al:example.org', 'Al')] }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('Al: Reply');
  });

  it('только свои сообщения после receipt — без превью', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      { [room.roomId]: makeTimeline([message('e2', '@me:example.org', 'Mine')], 'e1') }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBeUndefined();
  });

  it('расшифрованное сообщение показывает тело core message view', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline([message('e1', '@al:example.org', 'Secret')]),
      },
      { [room.roomId]: [makeMember('@al:example.org', 'Al')] }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('Al: Secret');
  });

  it('нерашифрованное сообщение показывает плейсхолдер', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline([
          {
            kind: 'encrypted',
            eventId: 'e1',
            roomId: room.roomId,
            sender: '@al:example.org',
            timestamp: 10,
            preview: 'Unable to decrypt message',
            failure: 'missing-keys',
          },
        ]),
      }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('al: [Encrypted message]');
  });

  it('redacted message показывает плейсхолдер', () => {
    const room = makeRoom('!a:example.org');
    const redactedMessage = {
      kind: 'redacted' as const,
      eventId: 'e1',
      roomId: room.roomId,
      sender: '@al:example.org',
      timestamp: 10,
      preview: 'Message deleted',
      eventType: 'm.room.message',
    };
    const core = makeCore(
      { [room.roomId]: room },
      { [room.roomId]: makeTimeline([redactedMessage]) }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('al: [Deleted message]');
  });

  it('пропускает redacted state event и берёт следующее сообщение', () => {
    const room = makeRoom('!a:example.org');
    const redactedState = {
      kind: 'redacted' as const,
      eventId: 'e1',
      roomId: room.roomId,
      sender: '@bob:example.org',
      timestamp: 10,
      preview: 'Message deleted',
      eventType: 'm.room.member',
    };
    const core = makeCore(
      { [room.roomId]: room },
      {
        [room.roomId]: makeTimeline([redactedState, message('e2', '@al:example.org', 'Yo')]),
      },
      { [room.roomId]: [makeMember('@al:example.org', 'Al')] }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('Al: Yo');
  });

  it('использует core profile, если участник комнаты неизвестен', () => {
    const room = makeRoom('!a:example.org');
    const core = makeCore(
      { [room.roomId]: room },
      { [room.roomId]: makeTimeline([message('e1', '@al:example.org', 'Yo')]) },
      {},
      { '@al:example.org': { userId: '@al:example.org', displayName: 'Al Profile' } }
    );

    const [entry] = buildUnreadPaletteItems([makeRoomItem(room.roomId)], core, unread(), labels);
    expect(entry.item.preview).toBe('Al Profile: Yo');
  });

  it('отбрасывает комнаты без непрочитанных', () => {
    const core = makeCore({});

    expect(
      buildUnreadPaletteItems([makeRoomItem('!a:example.org')], core, unread(0), labels)
    ).toHaveLength(0);
  });

  it('сортирует по highlight, затем total и активности, и ограничивает список', () => {
    const rooms: Record<string, RoomView> = {};
    const items: PaletteItem[] = [];
    const roomToUnread: RoomToUnread = new Map();
    for (let i = 0; i < UNREAD_LIST_LIMIT + 5; i += 1) {
      const roomId = `!r${i}:example.org`;
      rooms[roomId] = makeRoom(roomId, i);
      items.push(makeRoomItem(roomId));
      roomToUnread.set(roomId, { total: i + 1, highlight: 0, from: null });
    }
    roomToUnread.set('!r0:example.org', {
      total: 1,
      highlight: 5,
      from: null,
    });
    const core = makeCore(rooms);

    const result = buildUnreadPaletteItems(items, core, roomToUnread, labels);

    expect(result).toHaveLength(UNREAD_LIST_LIMIT);
    expect(result[0].item.roomId).toBe('!r0:example.org');
  });

  it('не включает пространства', () => {
    const core = makeCore({});

    const spaceItem: PaletteItem = {
      id: 'space:!s:example.org',
      category: PaletteCategory.Spaces,
      title: 'Space',
      keywords: [],
      roomId: '!s:example.org',
      run: () => undefined,
    };
    const roomToUnread: RoomToUnread = new Map([
      ['!s:example.org', { total: 3, highlight: 0, from: null }],
    ]);

    expect(buildUnreadPaletteItems([spaceItem], core, roomToUnread, labels)).toHaveLength(0);
  });
});

describe('matchUnreadItem', () => {
  const item: PaletteItem = {
    ...makeRoomItem('!a:example.org', 'General'),
    subtitle: '@bob:example.org',
    preview: 'Al: Yo',
  };

  it('матчит по заголовку, описанию и превью', () => {
    expect(matchUnreadItem(item, 'gen')).toBe(true);
    expect(matchUnreadItem(item, 'bob')).toBe(true);
    expect(matchUnreadItem(item, 'Yo')).toBe(true);
  });

  it('не матчит при отсутствии совпадения', () => {
    expect(matchUnreadItem(item, 'zzz')).toBe(false);
  });

  it('пустой запрос матчит всё', () => {
    expect(matchUnreadItem(item, '  ')).toBe(true);
  });
});
