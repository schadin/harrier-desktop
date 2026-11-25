import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react-dom/test-utils';
import { createSnapshotStore, type HarrierCore, type RoomSummaryView } from '@harrier/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { factoryRoomIdByActivity } from '../utils/sort';
import { CoreProvider } from './useCore';

const summaries: readonly RoomSummaryView[] = [
  {
    roomId: '!a:example.org',
    name: 'Alpha',
    membership: 'join',
    isDirect: false,
    isSpace: false,
    lastActiveTimestamp: 100,
  },
  {
    roomId: '!b:example.org',
    name: 'Beta',
    membership: 'join',
    isDirect: false,
    isSpace: false,
    lastActiveTimestamp: 200,
  },
];

describe('useRoomSortSource', () => {
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
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('sorts from rooms.all without lazily opening room stores', async () => {
    const { useRoomSortSource } = await import('./useRoomSort');
    let source: Parameters<typeof factoryRoomIdByActivity>[0] | undefined;
    const core = {
      rooms: {
        all: createSnapshotStore(summaries),
        room() {
          throw new Error('Sorting must not open room stores');
        },
      },
    } as unknown as HarrierCore;

    function CaptureSource() {
      source = useRoomSortSource();
      return null;
    }

    renderToStaticMarkup(
      <CoreProvider value={core}>
        <CaptureSource />
      </CoreProvider>
    );

    expect(source?.getRoom('!a:example.org')).toBe(summaries[0]);
    expect(factoryRoomIdByActivity(source!)('!a:example.org', '!b:example.org')).toBe(100);
  });

  it('updates source and comparator identity only when rooms.all changes', async () => {
    const { useRoomSortSource } = await import('./useRoomSort');
    const store = createSnapshotStore(summaries);
    const core = {
      rooms: {
        all: store,
        room() {
          throw new Error('Sorting must not open room stores');
        },
      },
    } as unknown as HarrierCore;
    let source: Parameters<typeof factoryRoomIdByActivity>[0] | undefined;
    let comparator: ReturnType<typeof factoryRoomIdByActivity> | undefined;

    function CaptureSource() {
      const currentSource = useRoomSortSource();
      source = currentSource;
      comparator = useMemo(() => factoryRoomIdByActivity(currentSource), [currentSource]);
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
        <CaptureSource />
      </CoreProvider>
    );

    try {
      await act(async () => {
        root.render(element);
      });
      const initialSource = source;
      const initialComparator = comparator;

      await act(async () => {
        root.render(element);
      });
      expect(source).toBe(initialSource);
      expect(comparator).toBe(initialComparator);

      await act(async () => {
        store.publish(
          summaries.map((room) =>
            room.roomId === '!a:example.org' ? { ...room, lastActiveTimestamp: 300 } : room
          )
        );
      });
      expect(source).not.toBe(initialSource);
      expect(comparator).not.toBe(initialComparator);
      expect(comparator?.('!a:example.org', '!b:example.org')).toBe(-100);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
