import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createSnapshotStore,
  type HarrierCore,
  type JsonObject,
  type RoomView,
} from '@harrier/core';
import { describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../../hooks/useCore';
import { StateEvent } from '../../../types/matrix/room';
import { RoomCard } from './RoomCard';

vi.mock('folds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('folds')>();
  const Passthrough = ({ children }: { children?: ReactNode }) => children;
  return {
    ...actual,
    Overlay: ({ children, open }: { children?: ReactNode; open: boolean }) =>
      open ? children : null,
    OverlayBackdrop: () => null,
    OverlayCenter: Passthrough,
  };
});

const ALIAS = '#general:example.org';

const makeRoom = (roomId: string, name: string): RoomView => ({
  roomId,
  name,
  canonicalAlias: ALIAS,
  lastActiveTimestamp: 0,
  membership: 'join',
  isDirect: false,
  isSpace: false,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
});

const makeCore = (rooms: RoomView[], tombstonedRoomIds: string[] = []): HarrierCore => {
  const roomById = new Map(rooms.map((room) => [room.roomId, room]));
  const tombstoned = new Set(tombstonedRoomIds);
  return {
    rooms: {
      all: createSnapshotStore(rooms),
      list: createSnapshotStore(rooms),
      room: (roomId: string) => createSnapshotStore(roomById.get(roomId) ?? null),
      members: () => createSnapshotStore([]),
      stateEntry: (roomId: string, eventType: string) =>
        createSnapshotStore<JsonObject | null>(
          tombstoned.has(roomId) && eventType === StateEvent.RoomTombstone
            ? { replacement_room: '!replacement:example.org' }
            : null
        ),
    },
  } as unknown as HarrierCore;
};

const renderCard = (core: HarrierCore, allRooms: string[], name = 'Fallback General') =>
  renderToStaticMarkup(
    <CoreProvider value={core}>
      <RoomCard
        roomIdOrAlias={ALIAS}
        allRooms={allRooms}
        name={name}
        renderTopicViewer={() => null}
      />
    </CoreProvider>
  );

describe('RoomCard core alias resolution', () => {
  it('skips a tombstoned owner when a live room shares the alias', () => {
    const oldRoom = makeRoom('!old:example.org', 'Old General');
    const liveRoom = makeRoom('!live:example.org', 'Live General');
    const core = makeCore([oldRoom, liveRoom], [oldRoom.roomId]);

    const markup = renderCard(core, [oldRoom.roomId, liveRoom.roomId]);

    expect(markup).toContain('Live General');
    expect(markup).not.toContain('Old General');
  });

  it('preserves the supplied joined-room candidate order for alias collisions', () => {
    const firstRoom = makeRoom('!first:example.org', 'First General');
    const secondRoom = makeRoom('!second:example.org', 'Second General');
    const core = makeCore([firstRoom, secondRoom]);

    const markup = renderCard(core, [secondRoom.roomId, firstRoom.roomId]);

    expect(markup).toContain('Second General');
    expect(markup).not.toContain('First General');
  });

  it('keeps a sole tombstoned alias on the join prompt instead of treating it as joined', () => {
    const oldRoom = makeRoom('!old:example.org', 'Old General');
    const core = makeCore([oldRoom], [oldRoom.roomId]);

    const markup = renderCard(core, [oldRoom.roomId]);

    expect(markup).toContain('Fallback General');
    expect(markup).not.toContain('Old General');
  });
});
