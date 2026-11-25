import type { HarrierCore, MediaRef, MediaUrlOptions, RoomView } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from './room';

type MediaCall = {
  ref: MediaRef;
  options?: MediaUrlOptions;
};

const createCore = () => {
  const calls: MediaCall[] = [];
  const core = {
    media: {
      url(ref: MediaRef, options?: MediaUrlOptions): string | null {
        calls.push({ ref, options });
        return 'https://media.example.org/avatar';
      },
    },
  } as unknown as HarrierCore;
  return { core, calls };
};

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
  avatarMxc: 'mxc://example.org/room',
  dmAvatarMxc: 'mxc://example.org/member',
} as RoomView;

describe('core room avatar helpers', () => {
  it('resolves the room avatar with the legacy crop and URL options', () => {
    const { core, calls } = createCore();

    expect(getRoomAvatarUrl(core, room, 96, true)).toBe('https://media.example.org/avatar');
    expect(calls).toEqual([
      {
        ref: {
          mxcUrl: 'mxc://example.org/room',
          width: 96,
          height: 96,
          resizeMethod: 'crop',
        },
        options: {
          useAuthentication: true,
          allowDirectLinks: false,
          allowRedirects: false,
        },
      },
    ]);
  });

  it('does not resolve media when the room has no avatar', () => {
    const { core, calls } = createCore();
    const roomWithoutAvatar = { ...room, avatarMxc: undefined } as RoomView;

    expect(getRoomAvatarUrl(core, roomWithoutAvatar)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('prefers the direct member avatar for direct rooms', () => {
    const { core, calls } = createCore();

    expect(getDirectRoomAvatarUrl(core, room)).toBe('https://media.example.org/avatar');
    expect(calls[0]?.ref).toEqual({
      mxcUrl: 'mxc://example.org/member',
      width: 32,
      height: 32,
      resizeMethod: 'crop',
    });
  });

  it('falls back to the room avatar when the direct member has no avatar', () => {
    const { core, calls } = createCore();
    const roomWithoutDirectAvatar = { ...room, dmAvatarMxc: undefined } as RoomView;

    expect(getDirectRoomAvatarUrl(core, roomWithoutDirectAvatar, 96, false)).toBe(
      'https://media.example.org/avatar'
    );
    expect(calls[0]?.ref.mxcUrl).toBe('mxc://example.org/room');
    expect(calls[0]?.options).toEqual({
      useAuthentication: false,
      allowDirectLinks: false,
      allowRedirects: false,
    });
  });
});
