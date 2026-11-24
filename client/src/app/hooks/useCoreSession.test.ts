import type { SessionView } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { getSessionUserId } from './useCoreSession';

const session: SessionView = {
  userId: '@user:example.org',
  deviceId: 'DEVICE',
  ready: true,
};

describe('getSessionUserId', () => {
  it('returns the session user ID', () => {
    expect(getSessionUserId(session)).toBe('@user:example.org');
  });

  it('preserves null when the session is absent', () => {
    expect(getSessionUserId(null)).toBeNull();
  });
});
