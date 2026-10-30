import { describe, expectTypeOf, it } from 'vitest';
import type { HarrierCore, TimelineItem } from './index';

describe('public contract consumer', () => {
  it('exposes the root interface and timeline item union without SDK types', () => {
    expectTypeOf<HarrierCore['capabilities']>().toMatchTypeOf<{ calls: boolean }>();
    expectTypeOf<TimelineItem['kind']>().toEqualTypeOf<
      'message' | 'state' | 'encrypted' | 'redacted' | 'unsupported'
    >();
  });
});

describe('raw SDK access is absent from the public root', () => {
  it('has no raw client, room or event handles', () => {
    expectTypeOf<keyof HarrierCore>().toEqualTypeOf<
      'capabilities' | 'auth' | 'rooms' | 'timeline' | 'presence'
    >();
  });
});
