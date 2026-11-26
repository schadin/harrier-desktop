import { describe, expectTypeOf, it } from 'vitest';
import type {
  HarrierCore,
  OwnProfileUpdate,
  RoomSummaryView,
  RoomView,
  ThreepidMediumView,
  ThreepidView,
  TimelineItem,
} from './index';

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

  it('exposes own profile updates and homeserver 3PID views', () => {
    expectTypeOf<ThreepidMediumView>().toEqualTypeOf<'email' | 'msisdn'>();
    expectTypeOf<OwnProfileUpdate['avatarUrl']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ThreepidView['validatedAt']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ThreepidView['addedAt']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ThreepidView['bound']>().toEqualTypeOf<boolean | undefined>();
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
