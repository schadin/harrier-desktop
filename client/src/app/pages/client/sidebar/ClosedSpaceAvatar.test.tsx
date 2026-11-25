import type { HarrierCore, MediaRef, MediaUrlOptions, RoomView } from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../../../hooks/useCore';
import { ClosedSpaceAvatar } from './ClosedSpaceAvatar';

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
  avatarMxc: 'mxc://example.org/old-avatar',
} as RoomView;

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

describe('ClosedSpaceAvatar', () => {
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
        appendChild: (child: Node) => child,
        insertBefore: (child: Node) => child,
        removeChild: (child: Node) => child,
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

  it('resolves a new avatar when the core room snapshot changes', async () => {
    const store = createSnapshotStore<RoomView | null>(space);
    const resolvedAvatars: string[] = [];
    const core = {
      rooms: {
        room: () => store,
      },
      media: {
        authenticated: createSnapshotStore(false),
        url(ref: MediaRef, options?: MediaUrlOptions): string | null {
          resolvedAvatars.push(ref.mxcUrl);
          return `https://media.example.org/${ref.mxcUrl.slice(6)}?auth=${
            options?.useAuthentication
          }`;
        },
      },
    } as unknown as HarrierCore;
    const root = createRoot(createContainer());

    try {
      await act(async () => {
        root.render(
          <CoreProvider value={core}>
            <ClosedSpaceAvatar roomId={space.roomId} name={space.name} />
          </CoreProvider>
        );
      });
      expect(resolvedAvatars).toEqual(['mxc://example.org/old-avatar']);

      await act(async () => {
        store.publish({ ...space, avatarMxc: 'mxc://example.org/new-avatar' });
      });
      expect(resolvedAvatars).toEqual([
        'mxc://example.org/old-avatar',
        'mxc://example.org/new-avatar',
      ]);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
