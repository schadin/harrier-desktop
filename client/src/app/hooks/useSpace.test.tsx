import type { HarrierCore, RoomView } from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import React, { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CoreProvider } from './useCore';
import { SpaceProvider, useRequiredCoreSpace } from './useSpace';

const space = {
  roomId: '!space:example.org',
  name: 'Space',
  membership: 'join',
  isDirect: false,
  isSpace: true,
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

const renderSpace = (core: HarrierCore, spaceId?: string | null): string => {
  function Probe() {
    const value = useRequiredCoreSpace();
    return <span>{value.name}</span>;
  }

  return renderToStaticMarkup(
    <CoreProvider value={core}>
      <SpaceProvider value={spaceId ?? null}>
        <Probe />
      </SpaceProvider>
    </CoreProvider>
  );
};

describe('space context contract', () => {
  it('accepts only a space ID or null in SpaceProvider', () => {
    expectTypeOf<ComponentProps<typeof SpaceProvider>['value']>().toEqualTypeOf<string | null>();
  });

  it('reads the required space from the core snapshot', () => {
    expect(renderSpace(createCore(space), space.roomId)).toBe('<span>Space</span>');
  });

  it('preserves the missing provider error', () => {
    expect(() => renderSpace(createCore(space))).toThrow('Space not provided!');
  });

  it('preserves the missing space error', () => {
    expect(() => renderSpace(createCore(null), space.roomId)).toThrow(
      `Space ${space.roomId} not found!`
    );
  });
});
