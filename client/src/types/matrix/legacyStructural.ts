import type {
  CreateRoomOptions,
  IContent,
  IEventRelation,
  IMessagesResponse,
  MatrixEventUnsigned,
  MatrixRawEvent,
} from './protocol';
import type { IPushRule } from './pushRules';
import type { UIAuthCallback } from './uia';

const JOIN_RULE = {
  Public: 'public',
  Invite: 'invite',
  Private: 'private',
  Knock: 'knock',
  Restricted: 'restricted',
} as const;

export type JoinRule = typeof JOIN_RULE[keyof typeof JOIN_RULE];
export { JOIN_RULE as JoinRule };

const RELATION_TYPE = {
  Annotation: 'm.annotation',
  Replace: 'm.replace',
  Reference: 'm.reference',
  Thread: 'm.thread',
} as const;

export type RelationType = typeof RELATION_TYPE[keyof typeof RELATION_TYPE];
export { RELATION_TYPE as RelationType };

const EVENT_TYPE = {
  Reaction: 'm.reaction',
  Sticker: 'm.sticker',
  RTCNotification: 'org.matrix.msc4075.rtc.notification',
  RTCDecline: 'org.matrix.msc4310.rtc.decline',
} as const;

export type EventType = typeof EVENT_TYPE[keyof typeof EVENT_TYPE];
export { EVENT_TYPE as EventType };

const CLIENT_EVENT = {
  Event: 'event',
  ToDeviceEvent: 'toDeviceEvent',
} as const;

export type ClientEvent = typeof CLIENT_EVENT[keyof typeof CLIENT_EVENT];
export { CLIENT_EVENT as ClientEvent };

const ROOM_EVENT = {
  Timeline: 'Room.timeline',
} as const;

export type RoomEvent = typeof ROOM_EVENT[keyof typeof ROOM_EVENT];
export { ROOM_EVENT as RoomEvent };

const MATRIX_EVENT_EVENT = {
  Decrypted: 'Event.decrypted',
} as const;

export type MatrixEventEvent = typeof MATRIX_EVENT_EVENT[keyof typeof MATRIX_EVENT_EVENT];
export { MATRIX_EVENT_EVENT as MatrixEventEvent };

const ROOM_STATE_EVENT = {
  Events: 'RoomState.events',
} as const;

export type RoomStateEvent = typeof ROOM_STATE_EVENT[keyof typeof ROOM_STATE_EVENT];
export { ROOM_STATE_EVENT as RoomStateEvent };

const NOTIFICATION_COUNT_TYPE = {
  Highlight: 'highlight',
  Total: 'total',
} as const;

export type NotificationCountType =
  typeof NOTIFICATION_COUNT_TYPE[keyof typeof NOTIFICATION_COUNT_TYPE];
export { NOTIFICATION_COUNT_TYPE as NotificationCountType };

const EVENT_TIMELINE_DIRECTION = {
  FORWARDS: 'f',
  BACKWARDS: 'b',
} as const;

export type EventTimelineDirection =
  typeof EVENT_TIMELINE_DIRECTION[keyof typeof EVENT_TIMELINE_DIRECTION];
export { EVENT_TIMELINE_DIRECTION as EventTimelineDirection };

const VISIBILITY = {
  Public: 'public',
  Private: 'private',
} as const;

export type Visibility = typeof VISIBILITY[keyof typeof VISIBILITY];
export { VISIBILITY as Visibility };

const PRESET = {
  PrivateChat: 'private_chat',
  TrustedPrivateChat: 'trusted_private_chat',
  PublicChat: 'public_chat',
} as const;

export type Preset = typeof PRESET[keyof typeof PRESET];
export { PRESET as Preset };

const METHOD = {
  Get: 'GET',
  Put: 'PUT',
  Post: 'POST',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD',
  Patch: 'PATCH',
} as const;

export type Method = typeof METHOD[keyof typeof METHOD];
export { METHOD as Method };

export type MatrixContent = Record<string, unknown>;

export type MatrixErrorData = {
  error?: string;
  errcode?: string;
  retry_after_ms?: number;
  content_uri?: string;
};

export interface MatrixErrorLike extends Error {
  readonly httpStatus?: number;
  readonly errcode?: string;
  readonly error?: string;
  readonly data: MatrixErrorData;

  getRetryAfterMs(): number | null;
}

export class LegacyMatrixError extends Error implements MatrixErrorLike {
  public readonly httpStatus?: number;

  public readonly errcode?: string;

  public readonly error?: string;

  public readonly data: MatrixErrorData;

  public constructor(data: MatrixErrorData = {}) {
    super(`MatrixError: ${data.error || 'Unknown message'}`);
    this.name = data.errcode || 'Unknown error code';
    this.errcode = data.errcode;
    this.error = data.error;
    this.data = data;
  }

  public getRetryAfterMs(): number | null {
    if (this.errcode === 'M_LIMIT_EXCEEDED' && 'retry_after_ms' in this.data) {
      const retryAfterMs = this.data.retry_after_ms;
      if (!Number.isInteger(retryAfterMs)) {
        throw new Error('retry_after_ms is not an integer');
      }
      return retryAfterMs as number;
    }
    return null;
  }
}

export interface MatrixEventLike {
  readonly event: Partial<MatrixRawEvent>;
  readonly decryptionFailureReason: string | null;

  getId(): string | undefined;
  getSender(): string | undefined;
  getTs(): number;
  getType(): string;
  getStateKey(): string | undefined;
  getContent<T extends MatrixContent = IContent>(): T;
  getPrevContent(): IContent;
  getRelation(): IEventRelation | null;
  getEffectiveEvent(): MatrixRawEvent;
  getUnsigned(): MatrixEventUnsigned;
  getRoomId(): string | undefined;
  readonly relationEventId: string | undefined;
  readonly replyEventId: string | undefined;
  isEncrypted(): boolean;
  isBeingDecrypted(): boolean;
  getDecryptionPromise(): Promise<void> | null;
  isDecryptionFailure(): boolean;
  attemptDecryption(crypto: unknown): Promise<void>;
  isRelation(relType?: string): boolean;
  isRedaction(): boolean;
  isRedacted(): boolean;
}

export interface RoomMemberLike {
  readonly userId: string;
  readonly rawDisplayName: string;
  readonly membership?: string | undefined;
  readonly events: {
    member?: MatrixEventLike | null;
  };

  getMxcAvatarUrl(): string | undefined;
}

export interface RoomStateLike {
  getStateEvents(eventType: string): MatrixEventLike[];
  getStateEvents(eventType: string, stateKey: string): MatrixEventLike | null;
  getMembers(): RoomMemberLike[];
}

export interface RelationsLike {
  getRelations(): MatrixEventLike[];
  getSortedAnnotationsByKey(): [string, Set<MatrixEventLike>][] | null;
}

export interface RelationsContainerLike {
  getChildEventsForEvent(
    eventId: string,
    relationType: RelationType | string,
    eventType: EventType | string
  ): RelationsLike | undefined;
}

export interface EventTimelineSetLike {
  readonly relations: RelationsContainerLike;
}

export interface EventTimelineLike {
  getState(direction: EventTimelineDirection): RoomStateLike | undefined;
  getEvents(): MatrixEventLike[];
  getTimelineSet(): EventTimelineSetLike;
}

export interface RoomLike {
  readonly roomId: string;
  readonly name: string;

  getCanonicalAlias(): string | null;
  getMyMembership(): string;
  hasEncryptionStateEvent(): boolean;
  getMembers(): RoomMemberLike[];
  getMember(userId: string): RoomMemberLike | null;
  getJoinedMembers(): RoomMemberLike[];
  getLiveTimeline(): EventTimelineLike;
  getTimelineForEvent(eventId: string): EventTimelineLike | null;
  getUnfilteredTimelineSet(): EventTimelineSetLike;
  findEventById(eventId: string): MatrixEventLike | undefined;
  getJoinRule(): JoinRule;
  getType(): string | undefined;
  isCallRoom(): boolean;
  isSpaceRoom(): boolean;
  getEventReadUpTo(userId: string): string | null;
  getUnreadNotificationCount(type?: NotificationCountType): number;
  getMxcAvatarUrl(): string | null;
  getAvatarFallbackMember(): RoomMemberLike | undefined;
  hasMembershipState(userId: string, membership: string): boolean;
}

export interface UploadProgressLike {
  loaded: number;
  total: number;
}

export interface UploadResponseLike {
  content_uri: string;
}

export interface UploadOptionsLike {
  name?: string;
  type?: string;
  includeFilename?: boolean;
  progressHandler?(progress: UploadProgressLike): void;
}

export interface MatrixClientLike {
  getRooms(): RoomLike[];
  getRoom(roomId: string): RoomLike | null;
  getUserId(): string | null;
  // SDK uses branded event-type keys and generic content; keep this compatibility edge wide.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccountData(eventType: any): MatrixEventLike | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAccountData(eventType: any, content: any): Promise<unknown>;
  getRoomPushRule(scope: 'global' | 'device', roomId: string): IPushRule | undefined;
  uploadContent(file: File | Blob, options?: UploadOptionsLike): Promise<UploadResponseLike>;
  mxcUrlToHttp(
    mxcUrl: string,
    width?: number,
    height?: number,
    resizeMethod?: string,
    allowDirectLinks?: boolean,
    allowRedirects?: boolean,
    useAuthentication?: boolean
  ): string | null;
}

export interface MatrixHttpLike {
  authedRequest<T>(method: Method, path: string, query?: Record<string, unknown>): Promise<T>;
}

export interface MatrixClientCommandsLike extends MatrixClientLike {
  getSafeUserId(): string;
  createRoom(options: CreateRoomOptions): Promise<{ room_id: string }>;
  joinRoom(roomIdOrAlias: string): Promise<unknown>;
  leave(roomId: string): Promise<unknown>;
  invite(roomId: string, userId: string, reason?: string): Promise<unknown>;
  kick(roomId: string, userId: string, reason?: string): Promise<unknown>;
  ban(roomId: string, userId: string, reason?: string): Promise<unknown>;
  unban(roomId: string, userId: string): Promise<unknown>;
  getIgnoredUsers(): string[];
  setIgnoredUsers(userIds: string[]): Promise<unknown>;
  sendStateEvent(
    roomId: string,
    eventType: string,
    content: MatrixContent,
    stateKey?: string
  ): Promise<unknown>;
  timestampToEvent(
    roomId: string,
    timestamp: number,
    direction: EventTimelineDirection
  ): Promise<{ event_id: string }>;
  createMessagesRequest(
    roomId: string,
    fromToken: string | null,
    limit: number,
    direction: EventTimelineDirection,
    timelineFilter?: unknown
  ): Promise<IMessagesResponse>;
  readonly http: MatrixHttpLike;
}

export interface GeneratedSecretStorageKeyLike {
  privateKey: Uint8Array;
  encodedPrivateKey?: string;
}

export interface MatrixCryptoLike {
  createRecoveryKeyFromPassphrase(passphrase?: string): Promise<GeneratedSecretStorageKeyLike>;
  bootstrapSecretStorage(options: {
    createSecretStorageKey: () => Promise<GeneratedSecretStorageKeyLike>;
    setupNewSecretStorage: boolean;
  }): Promise<void>;
  bootstrapCrossSigning(options: {
    setupNewCrossSigning: boolean;
    authUploadDeviceSigningKeys: UIAuthCallback<void>;
  }): Promise<void>;
  resetKeyBackup(): Promise<void>;
}

export type TimelineEventHandler = (
  event: MatrixEventLike,
  room: RoomLike | undefined,
  toStartOfTimeline: boolean | undefined,
  removed: boolean,
  data: {
    timeline: EventTimelineLike;
    liveEvent?: boolean;
  }
) => void;

export type EventTimelineSetHandlerMap = {
  'Room.timeline': TimelineEventHandler;
};

export type MatrixClientCallEventMap = {
  event: (event: MatrixEventLike) => void;
  toDeviceEvent: (event: MatrixEventLike) => void;
  'Event.decrypted': (event: MatrixEventLike, error?: Error) => void;
  'RoomState.events': (event: MatrixEventLike) => void;
  'Room.timeline': TimelineEventHandler;
};

export interface MatrixClientCallLike extends MatrixClientLike {
  readonly baseUrl: string;
  readonly matrixRTC: {
    getRoomSession(room: RoomLike): { memberships: readonly unknown[] };
  };

  getSafeUserId(): string;
  getDeviceId(): string | null;
  getCrypto(): MatrixCryptoLike | undefined;
  sendEvent(roomId: string, eventType: string, content: MatrixContent): Promise<unknown>;
  decryptEventIfNeeded(event: MatrixEventLike): Promise<void>;
}

export interface MatrixClientCallEventEmitterLike {
  on<K extends keyof MatrixClientCallEventMap>(
    eventName: K,
    listener: MatrixClientCallEventMap[K]
  ): unknown;
  off<K extends keyof MatrixClientCallEventMap>(
    eventName: K,
    listener: MatrixClientCallEventMap[K]
  ): unknown;
  removeListener<K extends keyof MatrixClientCallEventMap>(
    eventName: K,
    listener: MatrixClientCallEventMap[K]
  ): unknown;
}

export type IMentions = {
  user_ids?: string[];
  room?: boolean;
};

export type IPowerLevelsContent = {
  users?: Record<string, number>;
  users_default?: number;
};
