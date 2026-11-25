import type { HarrierCore, RoomView } from '@harrier/core';
import { createSnapshotStore } from '@harrier/core';
import React, { Component, ComponentProps, ReactNode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react-dom/test-utils';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
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

let observedError: Error | undefined;
const getObservedError = (): Error | undefined => observedError;

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    observedError = error;
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;
    return error ? null : children;
  }
}

type TransitionProbeProps = {
  onError: (error: Error) => void;
};

function TransitionProbe({ onError }: TransitionProbeProps) {
  let value: RoomView | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- intentional hook-order transition probe
    value = useRequiredCoreSpace();
  } catch (error) {
    onError(error as Error);
  }
  const label = useMemo(() => value?.name ?? 'missing', [value]);
  return <span>{label}</span>;
}

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

describe('space context contract', () => {
  beforeAll(() => {
    const noop = () => undefined;
    function HTMLIFrameElement() {}
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

  it('keeps hook order stable when the provider changes from an ID to null', async () => {
    const core = createCore(space);
    const root = createRoot(createContainer());
    observedError = undefined;
    let caughtError: Error | undefined;
    const handleCaughtError = (error: Error) => {
      caughtError = error;
    };

    const render = (spaceId: string | null) => {
      root.render(
        <CoreProvider value={core}>
          <SpaceProvider value={spaceId}>
            <ErrorBoundary>
              <TransitionProbe onError={handleCaughtError} />
            </ErrorBoundary>
          </SpaceProvider>
        </CoreProvider>
      );
    };

    try {
      await act(async () => {
        render(space.roomId);
      });
      expect(getObservedError()).toBeUndefined();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await act(async () => {
          render(null);
        });
      } finally {
        consoleError.mockRestore();
      }
      expect(caughtError?.message).toBe('Space not provided!');
      expect(getObservedError()).toBeUndefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
