import type { HarrierCore } from '@harrier/core';
import { describe, expect, it, vi } from 'vitest';
import { getPowerTagIconSrc } from './useMemberPowerTag';

vi.mock('./useTheme', () => ({ ThemeKind: { Light: 'light', Dark: 'dark' } }));

const makeCore = (url: string | null) => {
  const mediaUrl = vi.fn(() => url);
  const core = { media: { url: mediaUrl } } as unknown as HarrierCore;
  return { core, mediaUrl };
};

describe('getPowerTagIconSrc', () => {
  it('resolves MXC icons through core media with their size and authentication options', () => {
    const { core, mediaUrl } = makeCore('https://media.example.org/power.png');

    expect(getPowerTagIconSrc(core, true, { key: 'mxc://example.org/power' })).toBe(
      'https://media.example.org/power.png'
    );
    expect(mediaUrl).toHaveBeenCalledWith(
      {
        mxcUrl: 'mxc://example.org/power',
        width: 96,
        height: 96,
        resizeMethod: 'scale',
      },
      { useAuthentication: true }
    );
  });

  it('preserves the sunflower fallback when core media cannot resolve an MXC icon', () => {
    const { core, mediaUrl } = makeCore(null);

    expect(getPowerTagIconSrc(core, false, { key: 'mxc://example.org/missing' })).toBe('🌻');
    expect(mediaUrl).toHaveBeenCalledWith(
      {
        mxcUrl: 'mxc://example.org/missing',
        width: 96,
        height: 96,
        resizeMethod: 'scale',
      },
      { useAuthentication: false }
    );
  });

  it('returns non-MXC icon keys unchanged without calling core media', () => {
    const { core, mediaUrl } = makeCore(null);

    expect(getPowerTagIconSrc(core, true, { key: '🌟' })).toBe('🌟');
    expect(mediaUrl).not.toHaveBeenCalled();
  });
});
