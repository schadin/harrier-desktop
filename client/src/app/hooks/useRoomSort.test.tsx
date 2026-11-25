import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
    vi.stubGlobal('localStorage', { getItem: () => null });
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
});
