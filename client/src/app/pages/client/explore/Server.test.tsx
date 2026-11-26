import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoreError, type HarrierCore, type ThirdPartyProtocolView } from '@harrier/core';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../../../hooks/useCore';
import { ThirdPartyProtocolsSelector } from './Server';

const queryState = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: queryState.data })),
}));

vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('folds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('folds')>();
  return {
    ...actual,
    PopOut: ({ children, content }: { children?: ReactNode; content?: ReactNode }) => (
      <>
        {content}
        {children}
      </>
    ),
  };
});

vi.mock('../../../hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({
    navigateSpace: () => undefined,
    navigateRoom: () => undefined,
  }),
}));

type QueryOptions<T> = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
};

const lastQueryOptions = <T,>(): QueryOptions<T> => {
  const call = vi.mocked(useQuery).mock.calls.at(-1);
  if (!call) throw new Error('useQuery was not called');
  return call[0] as QueryOptions<T>;
};

const makeCore = () => {
  const thirdPartyProtocols = vi.fn();
  return {
    thirdPartyProtocols,
    core: { rooms: { thirdPartyProtocols } } as unknown as HarrierCore,
  };
};

const protocols: ThirdPartyProtocolView[] = [
  {
    protocol: 'org.example.bridge',
    userFields: [],
    locationFields: [],
    fieldTypes: {},
    instances: [
      {
        instanceId: 'bridge-one',
        description: 'Bridge One',
        networkId: 'matrix',
        fields: {},
      },
    ],
  },
  {
    protocol: 'org.example.irc',
    userFields: [],
    locationFields: [],
    fieldTypes: {},
    instances: [
      {
        instanceId: 'irc-one',
        description: 'IRC One',
        networkId: 'irc',
        fields: {},
      },
    ],
  },
];

const renderSelector = (core: HarrierCore, instanceId?: string) =>
  renderToStaticMarkup(
    <CoreProvider value={core}>
      <ThirdPartyProtocolsSelector instanceId={instanceId} onChange={() => undefined} />
    </CoreProvider>
  );

describe('ThirdPartyProtocolsSelector core query', () => {
  beforeEach(() => {
    queryState.data = undefined;
    vi.clearAllMocks();
  });

  it('queries typed protocol views and flattens camelCase instances in order', async () => {
    const { core, thirdPartyProtocols } = makeCore();
    thirdPartyProtocols.mockResolvedValue({ ok: true, value: protocols });
    queryState.data = protocols;

    const markup = renderSelector(core, 'bridge-one');
    const options = lastQueryOptions<readonly ThirdPartyProtocolView[]>();

    expect(options.queryKey).toEqual(['thirdparty', 'protocols']);
    await expect(options.queryFn()).resolves.toBe(protocols);
    expect(thirdPartyProtocols).toHaveBeenCalledWith();
    expect(markup).toContain('Bridge One');
    expect(markup).toContain('data-instance-id="bridge-one"');
    expect(markup).toContain('data-instance-id="irc-one"');
    expect(markup.indexOf('Bridge One')).toBeLessThan(markup.indexOf('IRC One'));
  });

  it('rejects with the CoreError and stays hidden when the query fails', async () => {
    const { core, thirdPartyProtocols } = makeCore();
    const error = new CoreError('forbidden', 'Protocols forbidden');
    thirdPartyProtocols.mockResolvedValue({ ok: false, error });

    expect(renderSelector(core)).toBe('');
    await expect(lastQueryOptions<readonly ThirdPartyProtocolView[]>().queryFn()).rejects.toBe(
      error
    );
  });

  it('stays hidden for empty protocols or protocols without instances', () => {
    const { core } = makeCore();
    queryState.data = [];
    expect(renderSelector(core)).toBe('');

    queryState.data = [{ ...protocols[0], instances: [] }];
    expect(renderSelector(core)).toBe('');
  });
});
