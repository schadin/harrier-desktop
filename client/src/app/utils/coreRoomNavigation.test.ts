import { createElement, type MouseEvent as ReactMouseEvent, type ReactEventHandler } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import {
  createSnapshotStore,
  type HarrierCore,
  type IPowerLevels,
  type JsonObject,
  type RoomStateEntry,
  type RoomView,
} from '@harrier/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../hooks/useCore';
import {
  getCanonicalAliasOrRoomId,
  getCanonicalAliasRoomId,
  guessPerfectParent,
  resolveJoinedRoomId,
} from './coreRoomNavigation';
import { StateEvent } from '../../types/matrix/room';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

type RoomFixture = {
  room: RoomView;
  tombstone?: JsonObject;
  create?: RoomStateEntry;
  creators?: readonly string[];
  powerLevels?: IPowerLevels;
};

const makeRoom = (roomId: string, overrides: Partial<RoomView> = {}): RoomView => ({
  roomId,
  name: roomId,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  lastActiveTimestamp: 0,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
  ...overrides,
});

const makeCore = (fixtures: RoomFixture[]) => {
  const roomStores = new Map(
    fixtures.map(({ room }) => [room.roomId, createSnapshotStore<RoomView | null>(room)])
  );
  const tombstoneStores = new Map(
    fixtures.map(({ room, tombstone }) => [
      room.roomId,
      createSnapshotStore<JsonObject | null>(tombstone ?? null),
    ])
  );
  const createStores = new Map(
    fixtures.map(({ room, create }) => [
      room.roomId,
      createSnapshotStore<RoomStateEntry | null>(create ?? null),
    ])
  );
  const creatorStores = new Map(
    fixtures.map(({ room, creators }) => [
      room.roomId,
      createSnapshotStore<readonly string[]>(creators ?? []),
    ])
  );
  const powerLevelStores = new Map(
    fixtures.map(({ room, powerLevels }) => [
      room.roomId,
      createSnapshotStore<IPowerLevels>(powerLevels ?? {}),
    ])
  );
  const resolveAlias = vi.fn(async () => {
    throw new Error('Render-time navigation must not resolve aliases asynchronously');
  });

  const core = {
    rooms: {
      all: createSnapshotStore(fixtures.map(({ room }) => room)),
      room: (roomId: string) => roomStores.get(roomId) ?? createSnapshotStore(null),
      stateEntry: (roomId: string, eventType: string) => {
        if (eventType === StateEvent.RoomTombstone) {
          return tombstoneStores.get(roomId) ?? createSnapshotStore(null);
        }
        if (eventType === StateEvent.RoomCreate) {
          return createStores.get(roomId) ?? createSnapshotStore(null);
        }
        return createSnapshotStore(null);
      },
      creators: (roomId: string) =>
        creatorStores.get(roomId) ?? createSnapshotStore<readonly string[]>([]),
      powerLevels: (roomId: string) =>
        powerLevelStores.get(roomId) ?? createSnapshotStore<IPowerLevels>({}),
      resolveAlias,
      onState: () => () => undefined,
    },
  } as unknown as HarrierCore;

  return { core, resolveAlias };
};

describe('core room navigation helpers', () => {
  it('resolves a canonical alias to its room ID', () => {
    const { core } = makeCore([
      { room: makeRoom('!room:example.org', { canonicalAlias: '#room:example.org' }) },
    ]);

    expect(getCanonicalAliasRoomId(core, '#room:example.org')).toBe('!room:example.org');
    expect(getCanonicalAliasRoomId(core, '#missing:example.org')).toBeUndefined();
  });

  it('uses the first non-tombstoned room when aliases collide', () => {
    const { core } = makeCore([
      {
        room: makeRoom('!old:example.org', { canonicalAlias: '#room:example.org' }),
        tombstone: { replacement_room: '!new:example.org' },
      },
      { room: makeRoom('!first:example.org', { canonicalAlias: '#room:example.org' }) },
      { room: makeRoom('!second:example.org', { canonicalAlias: '#room:example.org' }) },
    ]);

    expect(getCanonicalAliasRoomId(core, '#room:example.org')).toBe('!first:example.org');
    expect(getCanonicalAliasOrRoomId(core, '!first:example.org')).toBe('#room:example.org');
    expect(getCanonicalAliasOrRoomId(core, '!second:example.org')).toBe('!second:example.org');
  });

  it('keeps tombstoned and unknown room IDs instead of emitting an alias', () => {
    const { core } = makeCore([
      {
        room: makeRoom('!old:example.org', { canonicalAlias: '#old:example.org' }),
        tombstone: { replacement_room: '!new:example.org' },
      },
    ]);

    expect(getCanonicalAliasOrRoomId(core, '!old:example.org')).toBe('!old:example.org');
    expect(getCanonicalAliasOrRoomId(core, '!unknown:example.org')).toBe('!unknown:example.org');
  });

  it('limits alias collision resolution to the supplied candidate IDs', () => {
    const { core } = makeCore([
      { room: makeRoom('!first:example.org', { canonicalAlias: '#room:example.org' }) },
      { room: makeRoom('!second:example.org', { canonicalAlias: '#room:example.org' }) },
    ]);

    expect(getCanonicalAliasOrRoomId(core, '!second:example.org', ['!second:example.org'])).toBe(
      '#room:example.org'
    );
  });

  it('resolves only joined room IDs and aliases without async federation lookup', () => {
    const { core, resolveAlias } = makeCore([
      { room: makeRoom('!room:example.org', { canonicalAlias: '#room:example.org' }) },
      { room: makeRoom('!invited:example.org', { membership: 'invite' }) },
    ]);
    const joinedRoomIds = ['!room:example.org'];

    expect(resolveJoinedRoomId(core, joinedRoomIds, '!room:example.org')).toBe('!room:example.org');
    expect(resolveJoinedRoomId(core, joinedRoomIds, '#room:example.org')).toBe('!room:example.org');
    expect(resolveJoinedRoomId(core, joinedRoomIds, '!invited:example.org')).toBeUndefined();
    expect(resolveJoinedRoomId(core, joinedRoomIds, '#missing:example.org')).toBeUndefined();
    expect(resolveAlias).not.toHaveBeenCalled();
  });

  it('selects the parent with the most matching creators and elevated users', () => {
    const { core } = makeCore([
      {
        room: makeRoom('!room:example.org'),
        creators: ['@creator:example.org'],
        powerLevels: { users_default: 0, users: { '@admin:example.org': 50 } },
      },
      {
        room: makeRoom('!first:example.org'),
        creators: ['@creator:example.org'],
        powerLevels: { users_default: 0, users: { '@other:example.org': 50 } },
      },
      {
        room: makeRoom('!second:example.org'),
        creators: ['@creator:example.org'],
        powerLevels: { users_default: 0, users: { '@admin:example.org': 1 } },
      },
    ]);

    expect(
      guessPerfectParent(core, '!room:example.org', ['!first:example.org', '!second:example.org'])
    ).toBe('!second:example.org');
  });

  it('preserves legacy create-event creators for older room versions', () => {
    const { core } = makeCore([
      {
        room: makeRoom('!room:example.org'),
        create: {
          eventType: StateEvent.RoomCreate,
          stateKey: '',
          sender: '@legacy:example.org',
          content: { room_version: '1' },
        },
      },
      { room: makeRoom('!parent:example.org'), creators: ['@legacy:example.org'] },
      { room: makeRoom('!other:example.org'), creators: ['@other:example.org'] },
    ]);

    expect(
      guessPerfectParent(core, '!room:example.org', ['!other:example.org', '!parent:example.org'])
    ).toBe('!parent:example.org');
  });

  it('keeps the first parent on a tie and returns no match without shared users', () => {
    const { core } = makeCore([
      { room: makeRoom('!room:example.org'), creators: ['@shared:example.org'] },
      { room: makeRoom('!first:example.org'), creators: ['@shared:example.org'] },
      { room: makeRoom('!second:example.org'), creators: ['@shared:example.org'] },
      { room: makeRoom('!unmatched:example.org'), creators: ['@other:example.org'] },
    ]);

    expect(
      guessPerfectParent(core, '!room:example.org', ['!first:example.org', '!second:example.org'])
    ).toBe('!first:example.org');
    expect(
      guessPerfectParent(core, '!room:example.org', [
        '!unmatched:example.org',
        '!first:example.org',
      ])
    ).toBe('!first:example.org');
    expect(
      guessPerfectParent(core, '!room:example.org', [
        '!unmatched:example.org',
        '!missing:example.org',
      ])
    ).toBeUndefined();
  });

  it('treats a malformed users_default as zero when scoring elevated users', () => {
    const malformedPowerLevels = {
      users_default: 'invalid',
      users: { '@admin:example.org': 10 },
    } as unknown as IPowerLevels;
    const { core } = makeCore([
      { room: makeRoom('!room:example.org'), powerLevels: malformedPowerLevels },
      { room: makeRoom('!parent:example.org'), powerLevels: malformedPowerLevels },
      { room: makeRoom('!other:example.org') },
    ]);

    expect(
      guessPerfectParent(core, '!room:example.org', ['!other:example.org', '!parent:example.org'])
    ).toBe('!parent:example.org');
  });

  it('keeps the sole parent even when no special users match', () => {
    const { core } = makeCore([
      { room: makeRoom('!room:example.org') },
      { room: makeRoom('!parent:example.org') },
    ]);

    expect(guessPerfectParent(core, '!room:example.org', ['!parent:example.org'])).toBe(
      '!parent:example.org'
    );
  });
});

let useMentionClickHandler: typeof import('../hooks/useMentionClickHandler').useMentionClickHandler;

const renderMentionHandler = (core: HarrierCore): ReactEventHandler<HTMLElement> => {
  let handler: ReactEventHandler<HTMLElement> | undefined;

  function Probe() {
    handler = useMentionClickHandler('!origin:example.org');
    return null;
  }

  renderToStaticMarkup(
    createElement(
      CoreProvider,
      { value: core },
      createElement(
        StaticRouter,
        { location: '/home/%21origin%3Aexample.org/' },
        createElement(Probe)
      )
    )
  );

  if (!handler) throw new Error('Mention handler was not rendered');
  return handler;
};

const clickMention = (
  handler: ReactEventHandler<HTMLElement>,
  mentionId: string,
  attributes: Record<string, string> = {}
) => {
  const attrs: Record<string, string | null> = {
    'data-mention-id': mentionId,
    ...attributes,
  };
  const event = {
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    currentTarget: {
      getAttribute: (name: string) => attrs[name] ?? null,
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    },
  } as unknown as ReactMouseEvent<HTMLElement>;

  handler(event);
  return event;
};

describe('mention navigation on core room views', () => {
  beforeAll(async () => {
    const noop = () => undefined;
    class HTMLIFrameElement {}
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', {
      event: undefined,
      HTMLIFrameElement,
      addEventListener: noop,
      removeEventListener: noop,
    });
    vi.stubGlobal('document', {
      addEventListener: noop,
      removeEventListener: noop,
      createElement: () => ({ style: {}, setAttribute: noop }),
      documentElement: {},
      activeElement: null,
      defaultView: window,
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ useMentionClickHandler } = await import('../hooks/useMentionClickHandler'));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    navigate.mockReset();
  });

  it('navigates to a joined space through its canonical alias', () => {
    const { core } = makeCore([
      {
        room: makeRoom('!space:example.org', {
          isSpace: true,
          canonicalAlias: '#space:example.org',
        }),
      },
    ]);
    navigate.mockClear();

    const event = clickMention(renderMentionHandler(core), '!space:example.org');

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/%23space%3Aexample.org');
  });

  it('navigates to a joined room and event through its canonical alias', () => {
    const { core } = makeCore([
      { room: makeRoom('!room:example.org', { canonicalAlias: '#room:example.org' }) },
    ]);
    navigate.mockClear();

    clickMention(renderMentionHandler(core), '!room:example.org', {
      'data-mention-event-id': '$event:example.org',
    });

    expect(navigate).toHaveBeenCalledWith(
      '/home/%23room%3Aexample.org/%24event%3Aexample.org',
      undefined
    );
  });

  it('keeps an unknown room mention on the join-before-navigate path with via servers', () => {
    const { core } = makeCore([]);
    navigate.mockClear();

    clickMention(renderMentionHandler(core), '!unknown:example.org', {
      'data-mention-event-id': '$event:example.org',
      'data-mention-via': 'one.example.org,two.example.org',
    });

    expect(navigate).toHaveBeenCalledWith(
      '/home/!unknown%3Aexample.org/%24event%3Aexample.org?viaServers=one.example.org%2Ctwo.example.org'
    );
  });
});
