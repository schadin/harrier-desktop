import type { SessionView } from '@harrier/core';
import { describe, expect, it } from 'vitest';
import { getSafeSessionUserId, getSessionUserId } from './useCoreSession';

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

describe('getSafeSessionUserId', () => {
  it('returns the session user ID', () => {
    expect(getSafeSessionUserId(session)).toBe('@user:example.org');
  });

  it('returns an empty string when the session is absent', () => {
    expect(getSafeSessionUserId(null)).toBe('');
  });
});
