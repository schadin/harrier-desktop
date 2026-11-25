import type { HarrierCore, JsonObject, RoomStateEntry, RoomView } from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { StateEvent } from '../../types/matrix/room';
import {
  getSpaceHierarchy,
  getSpaceJoinedHierarchy,
  HierarchyItem,
  HierarchyItemRoom,
  sortRoomsByOrder,
} from './useSpaceHierarchy';

const makeRoom = (roomId: string, isSpace = false): RoomView => ({
  roomId,
  name: roomId,
  lastActiveTimestamp: 0,
  membership: 'join',
  isDirect: false,
  isSpace,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
});

const makeChild = (
  childId: string,
  content: JsonObject = { via: ['example.org'] },
  timestamp: number | undefined = 10
): RoomStateEntry => ({
  eventType: StateEvent.SpaceChild,
  stateKey: childId,
  content,
  timestamp,
});

const makeCore = (entries: Record<string, readonly RoomStateEntry[]>): HarrierCore => {
  const stores = new Map(
    Object.entries(entries).map(([roomId, roomEntries]) => [
      roomId,
      createSnapshotStore(roomEntries),
    ])
  );
  return {
    rooms: {
      stateList(roomId: string, eventType: string) {
        expect(eventType).toBe(StateEvent.SpaceChild);
        return stores.get(roomId) ?? createSnapshotStore<readonly RoomStateEntry[]>([]);
      },
    },
  } as unknown as HarrierCore;
};

const roomIds = (items: readonly HierarchyItemRoom[]) => items.map((item) => item.roomId);
const sortItems = <T extends HierarchyItem>(_parentId: string, items: T[]) =>
  sortRoomsByOrder(items);

describe('core-backed space hierarchy', () => {
  it('reads child ID, via, order and timestamp from core state entries', () => {
    const core = makeCore({
      '!root:example.org': [
        makeChild('!child:example.org', { via: ['via.example.org'], order: 'b' }, 42),
      ],
    });
    const rooms = new Map([['!root:example.org', makeRoom('!root:example.org', true)]]);

    const hierarchy = getSpaceHierarchy(
      '!root:example.org',
      new Set(),
      core,
      (roomId) => rooms.get(roomId) ?? null,
      () => false,
      sortItems
    );

    expect(hierarchy[0].rooms).toEqual([
      {
        roomId: '!child:example.org',
        content: { via: ['via.example.org'], order: 'b' },
        ts: 42,
        parentId: '!root:example.org',
      },
    ]);
  });

  it('rejects invalid via and normalizes malformed order and timestamp', () => {
    const core = makeCore({
      '!root:example.org': [
        makeChild('!invalid-via:example.org', { via: 'example.org' }),
        makeChild(
          '!child:example.org',
          { via: [], order: 42 } as unknown as JsonObject,
          Number.NaN
        ),
      ],
    });
    const rooms = new Map([['!root:example.org', makeRoom('!root:example.org', true)]]);

    const [root] = getSpaceHierarchy(
      '!root:example.org',
      new Set(),
      core,
      (roomId) => rooms.get(roomId) ?? null,
      () => false,
      sortItems
    );

    expect(root.rooms).toHaveLength(1);
    expect(root.rooms?.[0]).toMatchObject({
      roomId: '!child:example.org',
      content: { via: [], order: undefined },
      ts: 0,
    });
  });

  it('keeps only the first duplicate child entry', () => {
    const core = makeCore({
      '!root:example.org': [
        makeChild('!child:example.org', { via: ['first.example.org'] }, 10),
        makeChild('!child:example.org', { via: ['second.example.org'] }, 20),
      ],
    });
    const rooms = new Map([['!root:example.org', makeRoom('!root:example.org', true)]]);

    const [root] = getSpaceHierarchy(
      '!root:example.org',
      new Set(),
      core,
      (roomId) => rooms.get(roomId) ?? null,
      () => false,
      sortItems
    );

    expect(root.rooms).toHaveLength(1);
    expect(root.rooms?.[0].content.via).toEqual(['first.example.org']);
    expect(root.rooms?.[0].ts).toBe(10);
  });

  it('guards space cycles without duplicating the root', () => {
    const core = makeCore({
      '!root:example.org': [makeChild('!sub:example.org')],
      '!sub:example.org': [makeChild('!root:example.org')],
    });
    const rooms = new Map([
      ['!root:example.org', makeRoom('!root:example.org', true)],
      ['!sub:example.org', makeRoom('!sub:example.org', true)],
    ]);

    const hierarchy = getSpaceHierarchy(
      '!root:example.org',
      new Set(),
      core,
      (roomId) => rooms.get(roomId) ?? null,
      () => false,
      sortItems
    );

    expect(hierarchy.map((item) => item.space.roomId)).toEqual([
      '!root:example.org',
      '!sub:example.org',
    ]);
    expect(hierarchy.flatMap((item) => item.rooms ?? [])).toEqual([]);
  });

  it('keeps unknown children in lobby but excludes them from joined hierarchy', () => {
    const core = makeCore({ '!root:example.org': [makeChild('!unknown:example.org')] });
    const getRoom = (roomId: string) =>
      roomId === '!root:example.org' ? makeRoom(roomId, true) : null;

    const [lobbyRoot] = getSpaceHierarchy(
      '!root:example.org',
      new Set(),
      core,
      getRoom,
      () => false,
      sortItems
    );
    const joined = getSpaceJoinedHierarchy(
      '!root:example.org',
      core,
      getRoom,
      () => false,
      sortItems
    );

    expect(roomIds(lobbyRoot.rooms ?? [])).toEqual(['!unknown:example.org']);
    expect(joined).toEqual([]);
  });

  it('preserves remote-space cache, collapsed categories and timestamp/order sorting', () => {
    const core = makeCore({
      '!root:example.org': [
        makeChild('!remote:example.org', { via: ['remote.example.org'] }, 1),
        makeChild('!closed:example.org', { via: ['closed.example.org'] }, 2),
        makeChild('!ordered-b:example.org', { via: [], order: 'b' }, 20),
        makeChild('!ordered-a:example.org', { via: [], order: 'a' }, 20),
        makeChild('!older:example.org', { via: [] }, 5),
      ],
      '!closed:example.org': [makeChild('!closed-child:example.org')],
    });
    const rooms = new Map([
      ['!root:example.org', makeRoom('!root:example.org', true)],
      ['!closed:example.org', makeRoom('!closed:example.org', true)],
    ]);

    const hierarchy = getSpaceHierarchy(
      '!root:example.org',
      new Set(['!remote:example.org']),
      core,
      (roomId) => rooms.get(roomId) ?? null,
      (roomId) => roomId === '!closed:example.org',
      sortItems
    );

    expect(hierarchy.map((item) => item.space.roomId)).toEqual([
      '!root:example.org',
      '!remote:example.org',
      '!closed:example.org',
    ]);
    expect(hierarchy[1].rooms).toBeUndefined();
    expect(hierarchy[2].rooms).toBeUndefined();
    expect(roomIds(hierarchy[0].rooms ?? [])).toEqual([
      '!ordered-a:example.org',
      '!ordered-b:example.org',
      '!older:example.org',
    ]);
  });

  it('applies joined-room exclusions before sorting', () => {
    const core = makeCore({
      '!root:example.org': [
        makeChild('!hidden:example.org', { via: [], order: 'a' }, 20),
        makeChild('!visible:example.org', { via: [], order: 'b' }, 10),
      ],
    });
    const rooms = new Map([
      ['!root:example.org', makeRoom('!root:example.org', true)],
      ['!hidden:example.org', makeRoom('!hidden:example.org')],
      ['!visible:example.org', makeRoom('!visible:example.org')],
    ]);

    const hierarchy = getSpaceJoinedHierarchy(
      '!root:example.org',
      core,
      (roomId) => rooms.get(roomId) ?? null,
      (_parentId, roomId) => roomId === '!hidden:example.org',
      sortItems
    );

    expect(hierarchy.map((item) => item.roomId)).toEqual([
      '!root:example.org',
      '!visible:example.org',
    ]);
  });
});
