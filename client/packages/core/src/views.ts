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
  readonly lastActiveTimestamp: Timestamp;
  readonly membership: Membership;
  readonly isDirect: boolean;
  readonly isSpace: boolean;
  readonly roomType?: string;
  readonly unread?: UnreadCountView;
  readonly notificationMode?: NotificationMode;
};

export type RoomAliasesView = {
  readonly canonical?: string;
  readonly alternatives: readonly string[];
  readonly local: readonly string[];
};

export type RoomView = RoomSummaryView & {
  readonly topic?: string;
  readonly encrypted: boolean;
  readonly guestCanJoin?: boolean;
  readonly memberCount?: number;
  readonly historyVisibility?: string;
  readonly joinRule?: string;
  readonly joinRuleContent?: JsonObject;
  readonly roomType?: string;
  readonly roomVersion?: string;
  readonly canonicalAlias?: string;
  readonly dmUserId?: string;
  readonly avatarMxc?: string;
  readonly dmAvatarMxc?: string;
  readonly viaServers: readonly string[];
  readonly spaceChildren: readonly string[];
};

export type MemberView = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly rawDisplayName?: string;
  readonly membership: Membership;
  readonly avatarMxc?: string;
  readonly powerLevel: number;
  readonly joinedAt?: Timestamp;
  readonly leftBySelf?: boolean;
};

export type MessageAttachmentKind = 'image' | 'video' | 'audio' | 'file' | 'location';

export type MessageAttachmentView = {
  readonly kind: MessageAttachmentKind;
  readonly mxcUrl?: string;
  readonly filename?: string;
  readonly mimetype?: string;
  readonly size?: number;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
  readonly geoUri?: string;
};

export type MessageContentView = {
  readonly msgtype: string;
  readonly body: string;
  readonly formattedBody?: string;
  readonly format?: string;
  readonly attachment?: MessageAttachmentView;
  readonly raw: JsonObject;
};

export type ReactionCountView = {
  readonly key: string;
  readonly count: number;
  readonly senders: readonly UserId[];
  readonly shortcode?: string;
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
      readonly localId?: string;
      readonly edited?: boolean;
      readonly replyTo?: EventId;
      readonly reactions?: readonly ReactionCountView[];
      readonly readBy?: readonly UserId[];
      readonly threadRoot?: EventId;
    })
  | (TimelineBase & {
      readonly kind: 'sticker';
      readonly content: JsonObject;
    })
  | (TimelineBase & {
      readonly kind: 'state';
      readonly eventType: string;
      readonly stateKey: string;
      readonly content: JsonObject;
      readonly prevContent?: JsonObject;
    })
  | (TimelineBase & {
      readonly kind: 'encrypted';
      readonly failure?: DecryptionFailureReason;
    })
  | (TimelineBase & { readonly kind: 'redacted'; readonly eventType: string })
  | (TimelineBase & { readonly kind: 'unsupported'; readonly eventType: string });

export type TimelineView = {
  readonly roomId: RoomId;
  readonly items: readonly TimelineItem[];
  readonly hasBackwardHistory: boolean;
  readonly readUpTo?: EventId;
  /** Index of the first displayed item after the own read receipt, when its target is loaded. */
  readonly unreadStartIndex?: number;
  readonly focusedEventId?: EventId;
};

export type ServerDiscoveryView = {
  readonly 'm.homeserver': { readonly base_url: string };
  readonly [key: string]: unknown;
};

export type IdentityProviderView = {
  readonly id?: string;
  readonly name?: string;
  readonly icon?: string;
  readonly brand?: string;
};

export type LoginFlowView = {
  readonly type: string;
  readonly identity_providers?: readonly IdentityProviderView[];
};

export type LoginFlowsView = {
  readonly flows: readonly LoginFlowView[];
};

export type LoginRequestView = {
  readonly type?: string;
  readonly [key: string]: unknown;
};

export type LoginResponseView = {
  readonly accessToken: string;
  readonly deviceId: string;
  readonly userId: string;
};

export type RegisterResponseView = {
  readonly userId: string;
  readonly accessToken?: string;
  readonly deviceId?: string;
};

export type RequestTokenView = {
  readonly sid: string;
  readonly submitUrl?: string;
};

export type RegistrationResultView = {
  readonly auth?: JsonObject;
  readonly response?: RegisterResponseView;
};

export type PasswordResetResultView = {
  readonly auth?: JsonObject;
  readonly response?: JsonObject;
};

export type SsoActionView = 'login' | 'register';

export type AuthMetadataView = {
  readonly issuer?: string;
  readonly account_management_uri?: string;
  readonly account_management_actions_supported?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
};

export type CapabilitiesView = {
  readonly 'm.room_versions'?: {
    readonly default?: string;
    readonly available?: Readonly<Record<string, unknown>>;
  };
  readonly 'm.change_password'?: { readonly enabled?: boolean };
  readonly 'm.set_avatar_url'?: { readonly enabled?: boolean };
  readonly 'm.set_displayname'?: { readonly enabled?: boolean };
  readonly [key: string]: unknown;
};

export type MediaConfigView = {
  readonly maxUploadSize?: number;
};

export type MediaResizeMethod = 'crop' | 'scale';

export type EncryptedAttachmentView = {
  readonly url: string;
  readonly key: JsonObject | string;
  readonly iv: string;
  readonly hashes?: Readonly<Record<string, string>>;
  readonly name?: string;
  readonly type?: string;
};

export type MediaRef = {
  readonly mxcUrl: string;
  readonly encrypted?: EncryptedAttachmentView;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly resizeMethod?: MediaResizeMethod;
};

export type MediaSourceView =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'blob'; readonly blob: Blob };

export type UrlPreviewView = {
  readonly siteName?: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: MediaRef;
};

export type NotificationView = {
  readonly id: string;
  readonly roomId: string;
  readonly eventId?: string;
  readonly senderId?: string;
  readonly type: string;
  readonly content: JsonObject;
  readonly event: {
    readonly event_id: string;
    readonly sender: string;
    readonly type: string;
    readonly content: JsonObject;
    readonly origin_server_ts: number;
  };
  readonly timestamp: number;
  readonly read: boolean;
};

export type NotificationPageView = {
  readonly items: readonly NotificationView[];
  readonly nextToken?: string;
};

export type MessageSearchEventView = {
  readonly event_id: string;
  readonly room_id: string;
  readonly sender: string;
  readonly type: string;
  readonly content: JsonObject;
  readonly origin_server_ts: number;
  readonly unsigned?: {
    readonly redacted_because?: { readonly content?: { readonly reason?: string } };
  };
};

export type MessageSearchContextView = {
  readonly start?: string;
  readonly end?: string;
  readonly events_before?: readonly MessageSearchEventView[];
  readonly events_after?: readonly MessageSearchEventView[];
};

export type MessageSearchItemView = {
  readonly rank: number;
  readonly event: MessageSearchEventView;
  readonly context: MessageSearchContextView;
};

export type MessageSearchGroupView = {
  readonly roomId: string;
  readonly items: readonly MessageSearchItemView[];
};

export type MessageSearchResultView = {
  readonly nextToken?: string;
  readonly highlights: readonly string[];
  readonly groups: readonly MessageSearchGroupView[];
};

export type MessageSearchParamsView = {
  readonly term?: string;
  readonly order?: 'recent' | 'rank';
  readonly rooms?: readonly string[];
  readonly senders?: readonly string[];
};

export type RoomNotificationModeView = 'unset' | 'mute' | 'special' | 'all';

export type NotificationPreferencesView = {
  readonly mute: readonly string[];
  readonly specialMessages: readonly string[];
  readonly allMessages: readonly string[];
};

export type BackupTrustView = {
  readonly trusted: boolean;
  readonly matchesDecryptionKey: boolean;
};

export type BackupStatusView = {
  readonly enabled: boolean;
  readonly version?: string;
  readonly count?: number;
  readonly infoAbsent: boolean;
  readonly sessionsRemaining: number;
  readonly failure?: string;
  readonly trust?: BackupTrustView;
};

export type BackupProgressDataView = {
  readonly downloaded: number;
  readonly successes: number;
  readonly failures: number;
  readonly total: number;
};

export type BackupProgressView =
  | { readonly status: 'idle' }
  | { readonly status: 'fetching' }
  | { readonly status: 'loading'; readonly data: BackupProgressDataView }
  | { readonly status: 'done' };

export type VerificationPhaseView =
  | 'unsent'
  | 'requested'
  | 'ready'
  | 'started'
  | 'cancelled'
  | 'done';

export type SasEmojiView = {
  readonly emoji: string;
  readonly name: string;
};

export type VerificationRequestView = {
  readonly id: string;
  readonly otherUserId: UserId;
  readonly otherDeviceId?: string;
  readonly isSelf: boolean;
  readonly initiatedByMe: boolean;
  readonly hasVerifier: boolean;
  readonly phase: VerificationPhaseView;
  readonly sas?: { readonly emoji: readonly SasEmojiView[] };
};

export type CallParticipantView = {
  readonly userId: UserId;
  readonly deviceId?: string;
  readonly memberId?: string;
  readonly callIntent?: string;
};

export type CallView = {
  readonly roomId: RoomId;
  readonly participants: readonly CallParticipantView[];
};

export type DeviceTrust = 'unknown' | 'unverified' | 'verified' | 'unsupported';

export type DeviceView = {
  readonly deviceId: string;
  readonly displayName?: string;
  readonly lastSeenIp?: string;
  readonly lastSeenTs?: number;
  readonly isCurrent: boolean;
  readonly trust: DeviceTrust;
  readonly ed25519?: string;
};

export type PresenceStatus = 'online' | 'offline' | 'unavailable';

export type UserProfileView = {
  readonly userId: UserId;
  readonly avatarUrl?: string;
  readonly displayName?: string;
};

export type PresenceView = {
  readonly userId: UserId;
  readonly status: PresenceStatus;
  readonly statusMessage?: string;
  readonly active: boolean;
  readonly lastActiveTs?: number;
};

export type UnreadMapEntry = {
  readonly roomId: RoomId;
  readonly unread: UnreadCountView;
};

export type RoomAccountDataEntry = {
  readonly type: string;
  readonly content: JsonObject;
};

export type RoomStateEntry = {
  readonly eventType?: string;
  readonly stateKey: string;
  readonly content: JsonObject;
  readonly eventId?: string;
  readonly sender?: string;
  readonly timestamp?: number;
};

export type PublicRoomView = {
  readonly roomId: RoomId;
  readonly name?: string;
  readonly topic?: string;
  readonly avatarMxc?: string;
  readonly canonicalAlias?: string;
  readonly joinRule?: string;
  readonly roomType?: string;
  readonly joinedMembers: number;
  readonly worldReadable: boolean;
  readonly guestCanJoin: boolean;
};

export type UploadStatus = 'uploading' | 'done' | 'failed';

export type UploadView = {
  readonly localId: string;
  readonly filename: string;
  readonly status: UploadStatus;
  readonly loaded: number;
  readonly total: number;
  readonly mxc?: string;
  readonly error?: string;
};

export type SendStatusView = {
  readonly localId: string;
  readonly roomId: RoomId;
  readonly status: SendStatus;
  readonly error?: string;
};
