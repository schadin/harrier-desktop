import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createSnapshotStore,
  type HarrierCore,
  type JsonObject,
  type RoomStateEntry,
  type RoomView,
} from '@harrier/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../useCore';
import { StateEvent } from '../../../types/matrix/room';

const makeRoom = (roomId: string, canonicalAlias?: string): RoomView => ({
  roomId,
  name: roomId,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  lastActiveTimestamp: 0,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
  canonicalAlias,
});

const createCore = () => {
  const firstRoom = makeRoom('!first:example.org', '#room:example.org');
  const secondRoom = makeRoom('!second:example.org', '#room:example.org');
  const firstStore = createSnapshotStore<RoomView | null>(firstRoom);
  const secondStore = createSnapshotStore<RoomView | null>(secondRoom);
  const tombstoneStore = createSnapshotStore<JsonObject | null>({
    replacement_room: '!replacement:example.org',
  });
  const allStore = createSnapshotStore<readonly RoomView[]>([firstRoom, secondRoom]);
  const stateListeners = new Set<
    (entry: RoomStateEntry & { roomId: string; eventType: string }) => void
  >();
  const stores = new Map([
    [firstRoom.roomId, firstStore],
    [secondRoom.roomId, secondStore],
  ]);

  const core = {
    rooms: {
      all: allStore,
      room: (roomId: string) => stores.get(roomId) ?? createSnapshotStore(null),
      stateEntry: (roomId: string, eventType: string) =>
        roomId === firstRoom.roomId && eventType === StateEvent.RoomTombstone
          ? tombstoneStore
          : createSnapshotStore(null),
      onState: (
        listener: (entry: RoomStateEntry & { roomId: string; eventType: string }) => void
      ) => {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      },
    },
  } as unknown as HarrierCore;

  const emitState = (eventType: StateEvent) => {
    stateListeners.forEach((listener) =>
      listener({ roomId: firstRoom.roomId, eventType, stateKey: '', content: {} })
    );
  };

  return {
    core,
    firstRoom,
    secondRoom,
    firstStore,
    secondStore,
    tombstoneStore,
    allStore,
    emitState,
  };
};

const createContainer = (): Element => {
  const noop = () => undefined;
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document,
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: (child: Node) => child,
    insertBefore: (child: Node) => child,
    removeChild: (child: Node) => child,
    style: {},
  } as unknown as Element;
};

let useSelectedRoom: typeof import('./useSelectedRoom').useSelectedRoom;
let useSelectedSpace: typeof import('./useSelectedSpace').useSelectedSpace;

const renderSelection = (
  kind: 'room' | 'space',
  fixture: ReturnType<typeof createCore>,
  onSelection: (value: string | undefined) => void
) => {
  function RoomProbe() {
    onSelection(useSelectedRoom());
    return null;
  }

  function SpaceProbe() {
    onSelection(useSelectedSpace());
    return null;
  }

  const path = kind === 'room' ? '/home/:roomIdOrAlias' : '/:spaceIdOrAlias';
  const location = kind === 'room' ? '/home/%23room%3Aexample.org' : '/%23room%3Aexample.org';
  const root = createRoot(createContainer());

  const render = () =>
    root.render(
      <CoreProvider value={fixture.core}>
        <MemoryRouter
          initialEntries={[location]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path={path} element={kind === 'room' ? <RoomProbe /> : <SpaceProbe />} />
          </Routes>
        </MemoryRouter>
      </CoreProvider>
    );

  return { root, render };
};

describe('selected route room state subscriptions', () => {
  beforeAll(async () => {
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
      createElement: () => ({ style: {}, setAttribute: noop }),
      documentElement: {},
      activeElement: null,
      defaultView: fakeWindow,
    };
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ useSelectedRoom } = await import('./useSelectedRoom'));
    ({ useSelectedSpace } = await import('./useSelectedSpace'));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it.each(['room', 'space'] as const)(
    'updates the selected %s when the canonical-alias owner changes',
    async (kind) => {
      const fixture = createCore();
      fixture.tombstoneStore.publish(null);
      let selection: string | undefined;
      const { root, render } = renderSelection(kind, fixture, (value) => {
        selection = value;
      });

      try {
        await act(async () => render());
        expect(selection).toBe(fixture.firstRoom.roomId);

        await act(async () => {
          fixture.firstStore.publish({ ...fixture.firstRoom, canonicalAlias: undefined });
          fixture.secondStore.publish({
            ...fixture.secondRoom,
            canonicalAlias: '#room:example.org',
          });
          fixture.emitState(StateEvent.RoomCanonicalAlias);
        });
        expect(selection).toBe(fixture.secondRoom.roomId);
      } finally {
        await act(async () => root.unmount());
      }
    }
  );

  it.each(['room', 'space'] as const)(
    'updates the selected %s when the first alias owner stops being tombstoned',
    async (kind) => {
      const fixture = createCore();
      let selection: string | undefined;
      const { root, render } = renderSelection(kind, fixture, (value) => {
        selection = value;
      });

      try {
        await act(async () => render());
        expect(selection).toBe(fixture.secondRoom.roomId);

        await act(async () => {
          fixture.tombstoneStore.publish(null);
          fixture.emitState(StateEvent.RoomTombstone);
        });
        expect(selection).toBe(fixture.firstRoom.roomId);
      } finally {
        await act(async () => root.unmount());
      }
    }
  );
});
