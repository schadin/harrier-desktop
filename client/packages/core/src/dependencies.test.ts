import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('@harrier/core dependencies', () => {
  it('declares no runtime dependency on Matrix SDK, React or Tauri', () => {
    const deps = Object.keys({
      ...(pkg as { dependencies?: Record<string, string> }).dependencies,
    });
    const forbidden = deps.filter(
      (name) =>
        name.startsWith('matrix-js-sdk') || name === 'react' || name.startsWith('@tauri-apps')
    );
    expect(forbidden).toEqual([]);
  });
});
