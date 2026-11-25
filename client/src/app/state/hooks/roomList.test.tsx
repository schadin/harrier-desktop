import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { atom } from 'jotai';
import { createSnapshotStore, type HarrierCore, type RoomSummaryView } from '@harrier/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../../hooks/useCore';
import { RoomClassification, useSelectedRooms, useSpaces } from './roomList';

const summary = (roomId: string, overrides: Partial<RoomSummaryView> = {}): RoomSummaryView => ({
  roomId,
  name: roomId,
  lastActiveTimestamp: 10,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  ...overrides,
});

describe('core-aware room list projections', () => {
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

  it('changes classification identity on m.room.create, not timestamp-only updates', async () => {
    const roomsAtom = atom(['!space:example.org', '!room:example.org']);
    const all = createSnapshotStore<readonly RoomSummaryView[]>([
      summary('!space:example.org', { isSpace: true, roomType: 'm.space' }),
      summary('!room:example.org'),
    ]);
    const core = {
      rooms: {
        all,
        room() {
          throw new Error('Room classification must come from rooms.all summaries');
        },
      },
    } as unknown as HarrierCore;
    let selected: string[] | undefined;
    const selector = (_roomId: string, room: RoomClassification | null) => room?.isSpace === true;

    function Probe() {
      selected = useSelectedRooms(roomsAtom, selector);
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
    const element = (
      <CoreProvider value={core}>
        <Probe />
      </CoreProvider>
    );

    try {
      await act(async () => root.render(element));
      const initial = selected;
      expect(initial).toEqual(['!space:example.org']);

      await act(async () => {
        all.publish([
          summary('!space:example.org', {
            isSpace: true,
            roomType: 'm.space',
            lastActiveTimestamp: 20,
          }),
          summary('!room:example.org', { lastActiveTimestamp: 20 }),
        ]);
      });
      expect(selected).toBe(initial);

      await act(async () => {
        all.publish([
          summary('!space:example.org', {
            isSpace: true,
            roomType: 'm.space',
            lastActiveTimestamp: 20,
          }),
          summary('!room:example.org', {
            isSpace: true,
            roomType: 'm.space',
            lastActiveTimestamp: 20,
          }),
        ]);
      });
      expect(selected).not.toBe(initial);
      expect(selected).toEqual(['!space:example.org', '!room:example.org']);
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('selects spaces without a raw client argument', async () => {
    const roomsAtom = atom(['!space:example.org', '!room:example.org']);
    const core = {
      rooms: {
        all: createSnapshotStore<readonly RoomSummaryView[]>([
          summary('!space:example.org', { isSpace: true }),
          summary('!room:example.org'),
        ]),
      },
    } as unknown as HarrierCore;
    let selected: string[] | undefined;

    function Probe() {
      selected = useSpaces(roomsAtom);
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

    try {
      await act(async () =>
        root.render(
          <CoreProvider value={core}>
            <Probe />
          </CoreProvider>
        )
      );
      expect(selected).toEqual(['!space:example.org']);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
