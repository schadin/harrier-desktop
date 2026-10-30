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

export type UnreadCountView = {
  readonly total: number;
  readonly highlight: number;
};

export type NotificationMode = 'all' | 'mentions' | 'mute';

export type RoomSummaryView = {
  readonly roomId: RoomId;
  readonly name: string;
  readonly membership: Membership;
  readonly isDirect: boolean;
  readonly isSpace: boolean;
  readonly unread?: UnreadCountView;
  readonly notificationMode?: NotificationMode;
};

export type RoomView = RoomSummaryView & {
  readonly topic?: string;
  readonly encrypted: boolean;
  readonly joinRule?: string;
  readonly roomType?: string;
  readonly canonicalAlias?: string;
  readonly dmUserId?: string;
  readonly avatarMxc?: string;
  readonly dmAvatarMxc?: string;
  readonly viaServers: readonly string[];
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

export type ReactionCountView = {
  readonly key: string;
  readonly count: number;
};

type TimelineBase = {
  readonly eventId: EventId;
  readonly roomId: RoomId;
  readonly sender: UserId;
  readonly timestamp: Timestamp;
  readonly preview: string;
};

export type TimelineItem =
  | (TimelineBase & {
      readonly kind: 'message';
      readonly content: MessageContentView;
      readonly status: SendStatus;
      readonly replyTo?: EventId;
      readonly reactions?: readonly ReactionCountView[];
      readonly readBy?: readonly UserId[];
      readonly threadRoot?: EventId;
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
  readonly readUpTo?: EventId;
};

export type PresenceStatus = 'online' | 'offline' | 'unavailable';

export type PresenceView = {
  readonly userId: UserId;
  readonly status: PresenceStatus;
};

export type SendStatusView = {
  readonly localId: string;
  readonly roomId: RoomId;
  readonly status: SendStatus;
  readonly error?: string;
};
