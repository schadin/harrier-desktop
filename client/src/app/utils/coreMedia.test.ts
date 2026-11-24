import type { HarrierCore, MediaRef, MediaUrlOptions } from '@harrier/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoreProvider } from '../hooks/useCore';
import { resolveMediaUrl, useMediaUrl } from './coreMedia';

const createCore = (): HarrierCore =>
  ({
    media: {
      url(ref: MediaRef, options?: MediaUrlOptions): string | null {
        const match = /^mxc:\/\/([^/]+)\/([^/]+)$/.exec(ref.mxcUrl);
        if (!match || ref.encrypted) return null;
        const url = new URL(`https://media.example.org/${match[1]}/${match[2]}`);
        if (ref.width !== undefined) url.searchParams.set('width', String(ref.width));
        if (ref.height !== undefined) url.searchParams.set('height', String(ref.height));
        if (ref.resizeMethod !== undefined) url.searchParams.set('method', ref.resizeMethod);
        if (options?.useAuthentication !== undefined) {
          url.searchParams.set('authenticated', String(options.useAuthentication));
        }
        if (options?.allowDirectLinks !== undefined) {
          url.searchParams.set('direct', String(options.allowDirectLinks));
        }
        if (options?.allowRedirects !== undefined) {
          url.searchParams.set('redirects', String(options.allowRedirects));
        }
        return url.href;
      },
    },
  } as unknown as HarrierCore);

const renderMediaUrl = (
  core: HarrierCore,
  ref: MediaRef,
  options?: MediaUrlOptions
): string | null => {
  let value: string | null = null;
  function Probe() {
    value = useMediaUrl(ref, options);
    return null;
  }
  renderToStaticMarkup(createElement(CoreProvider, { value: core }, createElement(Probe)));
  return value;
};

const encryptedRef: MediaRef = {
  mxcUrl: 'mxc://example.org/file',
  encrypted: {
    url: 'mxc://example.org/file',
    key: 'secret',
    iv: 'initialization-vector',
  },
};

describe('core media URL helpers', () => {
  it('resolves an unencrypted MXC to an HTTP URL', () => {
    expect(resolveMediaUrl(createCore(), { mxcUrl: 'mxc://example.org/file' })).toBe(
      'https://media.example.org/example.org/file'
    );
  });

  it('returns null for invalid MXC input', () => {
    expect(resolveMediaUrl(createCore(), { mxcUrl: 'not-an-mxc' })).toBeNull();
  });

  it('does not resolve encrypted attachments synchronously', () => {
    expect(resolveMediaUrl(createCore(), encryptedRef)).toBeNull();
  });

  it('forwards media dimensions and URL options', () => {
    expect(
      resolveMediaUrl(
        createCore(),
        { mxcUrl: 'mxc://example.org/file', width: 320, height: 180, resizeMethod: 'crop' },
        { useAuthentication: false, allowDirectLinks: true, allowRedirects: false }
      )
    ).toBe(
      'https://media.example.org/example.org/file?width=320&height=180&method=crop&authenticated=false&direct=true&redirects=false'
    );
  });

  it('reads the core and returns the URL synchronously during render', () => {
    expect(
      renderMediaUrl(
        createCore(),
        { mxcUrl: 'mxc://example.org/file', width: 64, resizeMethod: 'scale' },
        { useAuthentication: true, allowRedirects: true }
      )
    ).toBe(
      'https://media.example.org/example.org/file?width=64&method=scale&authenticated=true&redirects=true'
    );
  });
});
