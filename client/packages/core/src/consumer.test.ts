import { describe, expectTypeOf, it } from 'vitest';
import type { HarrierCore, RoomSummaryView, RoomView, TimelineItem } from './index';

describe('public contract consumer', () => {
  it('exposes required room activity and optional room version snapshots', () => {
    expectTypeOf<RoomSummaryView['lastActiveTimestamp']>().toEqualTypeOf<number>();
    expectTypeOf<RoomView['lastActiveTimestamp']>().toEqualTypeOf<number>();
    expectTypeOf<RoomView['roomVersion']>().toEqualTypeOf<string | undefined>();
  });

  it('exposes the root interface and timeline item union without SDK types', () => {
    expectTypeOf<HarrierCore['capabilities']>().toMatchTypeOf<{ calls: boolean }>();
    expectTypeOf<TimelineItem['kind']>().toEqualTypeOf<
      'message' | 'sticker' | 'state' | 'encrypted' | 'redacted' | 'unsupported'
    >();
  });
});

describe('raw SDK access is absent from the public root', () => {
  it('has no raw client, room or event handles', () => {
    expectTypeOf<keyof HarrierCore>().toEqualTypeOf<
      | 'capabilities'
      | 'auth'
      | 'rooms'
      | 'timeline'
      | 'presence'
      | 'crypto'
      | 'notifications'
      | 'media'
      | 'calls'
      | 'send'
      | 'uploads'
    >();
  });
});
