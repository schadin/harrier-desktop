export type RoomId = string;
export type EventId = string;
export type UserId = string;
export type Timestamp = number;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type Membership = 'join' | 'invite' | 'leave' | 'ban' | 'knock';

export type SendStatus = 'sending' | 'sent' | 'failed';

export type DecryptionFailureReason = 'missing-keys' | 'unknown-device' | 'unknown';

export type SessionView = {
  readonly userId: UserId;
  readonly deviceId: string;
  readonly ready: boolean;
};

export type SyncPhase = 'idle' | 'syncing' | 'prepared' | 'error' | 'stopped';

export type SyncView = {
  readonly phase: SyncPhase;
  readonly error?: string;
};

export type RoomSummaryView = {
  readonly roomId: RoomId;
  readonly name: string;
  readonly membership: Membership;
  readonly isDirect: boolean;
  readonly isSpace: boolean;
};

export type RoomView = RoomSummaryView & {
  readonly topic?: string;
  readonly encrypted: boolean;
};

export type MemberView = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly membership: Membership;
};

export type MessageContentView = {
  readonly msgtype: string;
  readonly body: string;
};

type TimelineBase = {
  readonly eventId: EventId;
  readonly roomId: RoomId;
  readonly sender: UserId;
  readonly timestamp: Timestamp;
};

export type TimelineItem =
  | (TimelineBase & {
      readonly kind: 'message';
      readonly content: MessageContentView;
      readonly status: SendStatus;
    })
  | (TimelineBase & {
      readonly kind: 'state';
      readonly eventType: string;
      readonly stateKey: string;
    })
  | (TimelineBase & { readonly kind: 'encrypted'; readonly failure?: DecryptionFailureReason })
  | (TimelineBase & { readonly kind: 'redacted' })
  | (TimelineBase & { readonly kind: 'unsupported'; readonly eventType: string });

export type TimelineView = {
  readonly roomId: RoomId;
  readonly items: readonly TimelineItem[];
  readonly hasBackwardHistory: boolean;
};

export type SendStatusView = {
  readonly localId: string;
  readonly roomId: RoomId;
  readonly status: SendStatus;
  readonly error?: string;
};
