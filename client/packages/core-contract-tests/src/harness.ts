import type { HarrierCore, JsonObject } from '@harrier/core';

export type SyncFixtureMessage = {
  readonly eventId: string;
  readonly sender: string;
  readonly body: string;
  readonly msgtype?: string;
  readonly formattedBody?: string;
  readonly url?: string;
  readonly filename?: string;
  readonly info?: Record<string, unknown>;
  readonly replaces?: string;
  readonly replyTo?: string;
  readonly redacted?: boolean;
  readonly status?: 'sending' | 'sent' | 'failed';
  readonly encrypted?: boolean;
  readonly failure?: 'missing-keys' | 'unknown-device' | 'unknown';
  readonly threadRoot?: string;
  readonly timestamp?: number;
};

export type SyncFixtureReaction = {
  readonly eventId: string;
  readonly target: string;
  readonly sender: string;
  readonly key: string;
  readonly shortcode?: string;
};

export type SyncFixtureReceipt = {
  readonly eventId: string;
  readonly userId: string;
};

export type SyncFixtureRoom = {
  readonly roomId: string;
  readonly membership: 'join' | 'invite' | 'leave';
  readonly name?: string;
  readonly direct?: boolean;
  readonly space?: boolean;
  readonly roomType?: string;
  readonly children?: readonly string[];
  readonly messages?: readonly SyncFixtureMessage[];
  readonly reactions?: readonly SyncFixtureReaction[];
  readonly receipts?: readonly SyncFixtureReceipt[];
  readonly backwardToken?: string;
  readonly history?: {
    readonly messages: readonly SyncFixtureMessage[];
    readonly nextToken?: string;
  };
  readonly typing?: readonly string[];
  readonly unread?: { readonly total: number; readonly highlight: number };
  readonly notificationMode?: 'all' | 'mentions' | 'mute';
  readonly topic?: string;
  readonly encrypted?: boolean;
  readonly powerLevels?: Record<string, unknown>;
  readonly roomVersion?: string;
  readonly additionalCreators?: readonly string[];
  readonly accountData?: Record<string, Record<string, unknown>>;
  readonly stateEvents?: readonly {
    readonly type: string;
    readonly stateKey: string;
    readonly content: Record<string, unknown>;
  }[];
  readonly sendFails?: boolean;
  readonly timelineStateEvents?: readonly {
    readonly eventId: string;
    readonly sender: string;
    readonly type: string;
    readonly stateKey: string;
    readonly content: Record<string, unknown>;
    readonly prevContent?: Record<string, unknown>;
    readonly timestamp?: number;
  }[];
  readonly members?: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly membership?: 'join' | 'invite' | 'leave';
    readonly avatarUrl?: string;
  }[];
};

export type SyncFixturePresence = {
  readonly userId: string;
  readonly status: 'online' | 'offline' | 'unavailable';
  readonly statusMessage?: string;
  readonly active?: boolean;
  readonly lastActiveTs?: number;
};

export type SyncFixtureDevice = {
  readonly deviceId: string;
  readonly displayName?: string;
  readonly lastSeenIp?: string;
  readonly lastSeenTs?: number;
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
  readonly presence?: readonly SyncFixturePresence[];
  readonly devices?: readonly SyncFixtureDevice[];
};

export type ContractOperationFailure = {
  readonly operation: string;
  readonly httpStatus: number;
  readonly errcode?: string;
  readonly error?: string;
  readonly retryAfterMs?: number;
  readonly data?: JsonObject;
};

export type CoreContractHarness = {
  readonly name: string;
  create(): Promise<HarrierCore>;
  applySyncFixture(fixture: SyncFixture): Promise<void>;
  failNextOperation(operation: string, failure: ContractOperationFailure): void;
  setRoomSummaryResponse(roomIdOrAlias: string, response: unknown): void;
  setThirdPartyProtocolsResponse(response: unknown): void;
  dispose(core: HarrierCore): Promise<void>;
};
