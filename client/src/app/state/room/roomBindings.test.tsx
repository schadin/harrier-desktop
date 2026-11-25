import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore, useAtomValue } from 'jotai';
import {
  createSnapshotStore,
  type HarrierCore,
  type RoomStateEntry,
  type RoomSummaryView,
  type UnreadMapEntry,
} from '@harrier/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../../hooks/useCore';
import { RoomToParents, StateEvent } from '../../../types/matrix/room';
import { roomToParentsAtom, useBindRoomToParentsAtom } from './roomToParents';
import { roomToUnreadAtom } from './roomToUnread';

const summary = (roomId: string, overrides: Partial<RoomSummaryView> = {}): RoomSummaryView => ({
  roomId,
  name: roomId,
  lastActiveTimestamp: 10,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  ...overrides,
});

type StateListener = Parameters<HarrierCore['rooms']['onState']>[0];

const makeCore = (initialRooms: readonly RoomSummaryView[]) => {
  const all = createSnapshotStore<readonly RoomSummaryView[]>(initialRooms);
  const unreads = createSnapshotStore<readonly UnreadMapEntry[]>([]);
  const parentStores = new Map<string, ReturnType<typeof createSnapshotStore<readonly string[]>>>();
  const stateListeners = new Set<StateListener>();
  const parents = (roomId: string) => {
    let store = parentStores.get(roomId);
    if (!store) {
      store = createSnapshotStore<readonly string[]>([]);
      parentStores.set(roomId, store);
    }
    return store;
  };
  const core = {
    rooms: {
      all,
      unreads,
      parents,
      onState(listener: StateListener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
    },
  } as unknown as HarrierCore;

  const emitChildState = (entry: RoomStateEntry & { roomId: string; eventType: string }) => {
    stateListeners.forEach((listener) => listener(entry));
  };

  return { core, all, unreads, parents, emitChildState };
};

describe('room hierarchy and unread bindings', () => {
  beforeAll(() => {
    const noop = () => undefined;
    class HTMLIFrameElement {}
    const fakeWindow = {
      event: undefined,
      HTMLIFrameElement,
      addEventListener: noop,
      removeEventListener: noop,
    };
    const fakeDocument = {
      addEventListener: noop,
      removeEventListener: noop,
      createElement: () => ({
        style: {},
        setAttribute: noop,
        addEventListener: noop,
        removeEventListener: noop,
      }),
      documentElement: {},
      activeElement: null,
      defaultView: fakeWindow,
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('updates parents on join/leave and m.space.child without timestamp identity churn', async () => {
    const rootId = '!root:example.org';
    const childId = '!child:example.org';
    const otherParentId = '!other:example.org';
    const { core, all, parents, emitChildState } = makeCore([
      summary(rootId, { isSpace: true }),
      summary(otherParentId, { isSpace: true }),
      summary(childId),
    ]);
    parents(childId).publish([rootId]);
    let current: RoomToParents | undefined;

    function Probe() {
      useBindRoomToParentsAtom(roomToParentsAtom);
      current = useAtomValue(roomToParentsAtom);
      return null;
    }

    const container = {
      nodeType: 1,
      nodeName: 'DIV',
      tagName: 'DIV',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      ownerDocument: document,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      style: {},
    } as unknown as Element;
    const root = createRoot(container);
    const store = createStore();

    try {
      await act(async () =>
        root.render(
          <Provider store={store}>
            <CoreProvider value={core}>
              <Probe />
            </CoreProvider>
          </Provider>
        )
      );
      const initial = current;
      expect(initial?.get(childId)).toEqual(new Set([rootId]));

      await act(async () => {
        all.publish([
          summary(rootId, { isSpace: true, lastActiveTimestamp: 20 }),
          summary(otherParentId, { isSpace: true, lastActiveTimestamp: 20 }),
          summary(childId, { lastActiveTimestamp: 20 }),
        ]);
      });
      expect(current).toBe(initial);

      await act(async () => {
        parents(childId).publish([rootId, otherParentId]);
        emitChildState({
          roomId: rootId,
          eventType: StateEvent.SpaceChild,
          stateKey: childId,
          content: { via: ['example.org'] },
          timestamp: 30,
        });
      });
      expect(current).not.toBe(initial);
      expect(current?.get(childId)).toEqual(new Set([rootId, otherParentId]));

      await act(async () => {
        all.publish([summary(childId, { lastActiveTimestamp: 20 })]);
      });
      expect(current?.has(childId)).toBe(false);

      parents(childId).publish([]);
      await act(async () => {
        all.publish([
          summary(rootId, { isSpace: true, lastActiveTimestamp: 20 }),
          summary(childId, { lastActiveTimestamp: 20 }),
        ]);
        parents(childId).publish([rootId]);
      });
      expect(current?.get(childId)).toEqual(new Set([rootId]));

      await act(async () => {
        all.publish([summary(rootId, { isSpace: true, lastActiveTimestamp: 20 })]);
      });
      expect(current?.has(childId)).toBe(false);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('RESET preserves core parent aggregation without counting it twice', () => {
    const store = createStore();
    const childId = '!child:example.org';
    const rootId = '!root:example.org';
    store.set(roomToParentsAtom, {
      type: 'INITIALIZE',
      roomToParents: new Map([
        [childId, new Set([rootId])],
        [rootId, new Set(['!grand:example.org'])],
      ]),
    });
    const coreUnreads: UnreadMapEntry[] = [
      { roomId: childId, unread: { total: 2, highlight: 1 } },
      { roomId: rootId, unread: { total: 5, highlight: 2 } },
      { roomId: '!grand:example.org', unread: { total: 5, highlight: 2 } },
    ];

    store.set(roomToUnreadAtom, {
      type: 'RESET',
      unreadInfos: coreUnreads.map(({ roomId, unread }) => ({ roomId, ...unread })),
    });

    expect(store.get(roomToUnreadAtom).get(childId)).toEqual({
      total: 2,
      highlight: 1,
      from: null,
    });
    expect(store.get(roomToUnreadAtom).get(rootId)).toEqual({
      total: 5,
      highlight: 2,
      from: null,
    });
    expect(store.get(roomToUnreadAtom).get('!grand:example.org')).toEqual({
      total: 5,
      highlight: 2,
      from: null,
    });
  });
});
