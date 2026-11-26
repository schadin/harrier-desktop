import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoreError, type FederatedRoomSummaryView, type HarrierCore } from '@harrier/core';
import { useQuery } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreProvider } from '../hooks/useCore';
import { RoomSummaryLoader } from './RoomSummaryLoader';

const queryState = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: queryState.data })),
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
  const summary = vi.fn();
  return {
    summary,
    core: { rooms: { summary } } as unknown as HarrierCore,
  };
};

const renderLoader = (core: HarrierCore, roomIdOrAlias: string) =>
  renderToStaticMarkup(
    <CoreProvider value={core}>
      <RoomSummaryLoader roomIdOrAlias={roomIdOrAlias}>
        {(summary) => <span>{summary?.name ?? 'Fallback card'}</span>}
      </RoomSummaryLoader>
    </CoreProvider>
  );

describe('RoomSummaryLoader federated query', () => {
  beforeEach(() => {
    queryState.data = undefined;
    vi.clearAllMocks();
  });

  it('queries the typed core operation with the existing key and returns its view', async () => {
    const { core, summary } = makeCore();
    const view: FederatedRoomSummaryView = {
      roomId: '!remote:example.org',
      name: 'Remote room',
    };
    summary.mockResolvedValue({ ok: true, value: view });
    queryState.data = view;

    const markup = renderLoader(core, '#remote:example.org');
    const options = lastQueryOptions<FederatedRoomSummaryView>();

    expect(markup).toContain('Remote room');
    expect(options.queryKey).toEqual(['#remote:example.org', 'summary']);
    await expect(options.queryFn()).resolves.toBe(view);
    expect(summary).toHaveBeenCalledWith('#remote:example.org');
  });

  it('rejects with the same CoreError when the core operation fails', async () => {
    const { core, summary } = makeCore();
    const error = new CoreError('forbidden', 'Summary forbidden');
    summary.mockResolvedValue({ ok: false, error });

    expect(renderLoader(core, '!remote:example.org')).toContain('Fallback card');
    await expect(lastQueryOptions<FederatedRoomSummaryView>().queryFn()).rejects.toBe(error);
  });

  it('passes undefined to the child while no summary is available', () => {
    const { core } = makeCore();

    expect(renderLoader(core, '!remote:example.org')).toContain('Fallback card');
  });
});
