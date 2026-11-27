import { describe, expectTypeOf, it } from 'vitest';
import type {
  BackupModule,
  CoreCapabilities,
  CoreResult,
  CryptoModule,
  HarrierCore,
  OwnProfileUpdate,
  RoomSummaryView,
  RoomView,
  ThreepidMediumView,
  ThreepidView,
  TimelineItem,
  TimelineModule,
  TimelineSourceView,
  MatrixEventView,
  TimelineEventSourceView,
  TimelineRelationView,
  ReactionEventView,
  ReactionCountView,
  NotificationView,
  DecryptionFailureCode,
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

  it('exposes crypto capability and key-management commands without SDK handles', () => {
    expectTypeOf<CoreCapabilities['crypto']>().toEqualTypeOf<boolean>();
    expectTypeOf<CryptoModule['exportRoomKeys']>().returns.toEqualTypeOf<
      Promise<CoreResult<string>>
    >();
    expectTypeOf<CryptoModule['importRoomKeys']>().returns.toEqualTypeOf<
      Promise<CoreResult<void>>
    >();
    expectTypeOf<BackupModule['reset']>().returns.toEqualTypeOf<Promise<CoreResult<void>>>();
    expectTypeOf<keyof CryptoModule>().toEqualTypeOf<
      | 'devices'
      | 'verification'
      | 'backup'
      | 'exportRoomKeys'
      | 'importRoomKeys'
      | 'refreshDevices'
      | 'trust'
      | 'unverifiedCount'
      | 'renameDevice'
      | 'deleteDevices'
    >();
  });

  it('exposes plain source, relation, reaction and notification DTOs', () => {
    expectTypeOf<MatrixEventView['content']>().toEqualTypeOf<{
      [key: string]: import('./views').JsonValue;
    }>();
    expectTypeOf<TimelineEventSourceView['original']>().toEqualTypeOf<MatrixEventView>();
    expectTypeOf<TimelineSourceView['edits']>().toEqualTypeOf<readonly TimelineEventSourceView[]>();
    expectTypeOf<TimelineRelationView['relType']>().toEqualTypeOf<string>();
    expectTypeOf<ReactionEventView['eventId']>().toEqualTypeOf<string>();
    expectTypeOf<ReactionCountView['events']>().toEqualTypeOf<readonly ReactionEventView[]>();
    expectTypeOf<NotificationView['event']['unsigned']>().toEqualTypeOf<
      { [key: string]: import('./views').JsonValue } | undefined
    >();
    expectTypeOf<NotificationView['timelineItem']>().toEqualTypeOf<TimelineItem | null>();
    expectTypeOf<DecryptionFailureCode>().toEqualTypeOf<
      | 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID'
      | 'MEGOLM_KEY_WITHHELD'
      | 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE'
      | 'OLM_UNKNOWN_MESSAGE_INDEX'
      | 'HISTORICAL_MESSAGE_NO_KEY_BACKUP'
      | 'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED'
      | 'HISTORICAL_MESSAGE_WORKING_BACKUP'
      | 'HISTORICAL_MESSAGE_USER_NOT_JOINED'
      | 'SENDER_IDENTITY_PREVIOUSLY_VERIFIED'
      | 'UNSIGNED_SENDER_DEVICE'
      | 'UNKNOWN_SENDER_DEVICE'
      | 'UNKNOWN_ERROR'
    >();
  });

  it('exposes observable event lookup and source through the timeline module', () => {
    expectTypeOf<TimelineModule['source']>().toEqualTypeOf<
      (
        roomId: string,
        eventId: string
      ) => Promise<import('./core').CoreResult<TimelineSourceView | null>>
    >();
    expectTypeOf<TimelineModule['observeEvent']>().toEqualTypeOf<
      (
        roomId: string,
        eventId: string
      ) => import('./snapshot').SnapshotStore<TimelineItem | null | undefined>
    >();
  });

  it('allows reactions on every shared timeline item variant but readBy only on messages', () => {
    expectTypeOf<Extract<TimelineItem, { kind: 'sticker' }>['reactions']>().toEqualTypeOf<
      readonly ReactionCountView[] | undefined
    >();
    expectTypeOf<Extract<TimelineItem, { kind: 'encrypted' }>['reactions']>().toEqualTypeOf<
      readonly ReactionCountView[] | undefined
    >();
    expectTypeOf<Extract<TimelineItem, { kind: 'redacted' }>['reactions']>().toEqualTypeOf<
      readonly ReactionCountView[] | undefined
    >();
    expectTypeOf<Extract<TimelineItem, { kind: 'message' }>['readBy']>().toEqualTypeOf<
      readonly string[] | undefined
    >();
    expectTypeOf<
      'readBy' extends keyof Extract<TimelineItem, { kind: 'sticker' }> ? true : false
    >().toEqualTypeOf<false>();
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
