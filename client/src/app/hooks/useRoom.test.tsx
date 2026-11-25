import type { HarrierCore, RoomView } from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import React, { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CoreProvider } from './useCore';
import { RoomProvider, useRequiredCoreRoomFromContext } from './useRoom';

const room = {
  roomId: '!room:example.org',
  name: 'Room',
  membership: 'join',
  isDirect: false,
  isSpace: false,
  lastActiveTimestamp: 0,
  encrypted: false,
  viaServers: [],
  spaceChildren: [],
} as RoomView;

const createCore = (value: RoomView | null): HarrierCore =>
  ({
    rooms: {
      room: () => createSnapshotStore(value),
    },
  } as unknown as HarrierCore);

const renderRoom = (core: HarrierCore, roomId?: string): string => {
  function Probe() {
    const value = useRequiredCoreRoomFromContext();
    return <span>{value.name}</span>;
  }

  const content = <Probe />;
  return renderToStaticMarkup(
    <CoreProvider value={core}>
      {roomId ? <RoomProvider value={roomId}>{content}</RoomProvider> : content}
    </CoreProvider>
  );
};

describe('room context contract', () => {
  it('accepts only a room ID in RoomProvider', () => {
    expectTypeOf<ComponentProps<typeof RoomProvider>['value']>().toEqualTypeOf<string>();
  });

  it('reads the required room from the core snapshot', () => {
    expect(renderRoom(createCore(room), room.roomId)).toBe('<span>Room</span>');
  });

  it('preserves the missing provider error', () => {
    expect(() => renderRoom(createCore(room))).toThrow('Room not provided!');
  });

  it('preserves the missing room error', () => {
    expect(() => renderRoom(createCore(null), room.roomId)).toThrow(
      `Room ${room.roomId} not found!`
    );
  });
});
