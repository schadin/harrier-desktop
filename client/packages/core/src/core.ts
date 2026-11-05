import type { CoreError } from './error';
import type { IPowerLevels } from './permissions';
import type { SnapshotStore } from './snapshot';
import type {
  JsonObject,
  MemberView,
  PublicRoomView,
  RoomAccountDataEntry,
  RoomStateEntry,
  RoomId,
  RoomSummaryView,
  RoomView,
  PresenceView,
  SessionView,
  SyncView,
  TimelineView,
  UnreadMapEntry,
  UserId,
} from './views';

export type CoreCapabilities = {
  readonly calls: boolean;
  readonly threads: boolean;
};

export type CoreResult<T> = { ok: true; value: T } | { ok: false; error: CoreError };

export type AuthModule = {
  readonly session: SnapshotStore<SessionView | null>;
  readonly sync: SnapshotStore<SyncView>;
  start(): Promise<CoreResult<void>>;
  stop(): Promise<void>;
  logout(): Promise<CoreResult<void>>;
};

export type DirectorySearchParams = {
  readonly server?: string;
  readonly limit: number;
  readonly since?: string;
  readonly searchTerm?: string;
  readonly roomTypes?: readonly string[];
  readonly thirdPartyInstanceId?: string;
};

export type HierarchyParams = {
  readonly limit: number;
  readonly maxDepth?: number;
  readonly suggestedOnly?: boolean;
  readonly from?: string;
};

export type PublicRoomsResult = {
  readonly rooms: readonly PublicRoomView[];
  readonly nextBatch?: string;
};

export type CreateRoomParams = {
  readonly version: string;
  readonly type?: string;
  readonly access: 'private' | 'restricted' | 'public';
  readonly knock: boolean;
  readonly name: string;
  readonly topic?: string;
  readonly aliasLocalPart?: string;
  readonly encryption?: boolean;
  readonly allowFederation: boolean;
  readonly additionalCreators?: readonly string[];
  readonly parent?: {
    readonly roomId: RoomId;
    readonly via: readonly string[];
  };
};

export type RoomUpgradeParams = {
  readonly newVersion: string;
  readonly additionalCreators?: readonly string[];
};

export type RoomsModule = {
  readonly all: SnapshotStore<readonly RoomSummaryView[]>;
  readonly list: SnapshotStore<readonly RoomSummaryView[]>;
  readonly unreads: SnapshotStore<readonly UnreadMapEntry[]>;
  room(roomId: RoomId): SnapshotStore<RoomView | null>;
  members(roomId: RoomId): SnapshotStore<readonly MemberView[]>;
  powerLevels(roomId: RoomId): SnapshotStore<IPowerLevels>;
  creators(roomId: RoomId): SnapshotStore<readonly string[]>;
  accountData(roomId: RoomId): SnapshotStore<readonly RoomAccountDataEntry[]>;
  setAccountData(roomId: RoomId, type: string, content: JsonObject): Promise<CoreResult<void>>;
  parents(roomId: RoomId): SnapshotStore<readonly RoomId[]>;
  join(roomIdOrAlias: string, viaServers?: readonly string[]): Promise<CoreResult<RoomId>>;
  leave(roomId: RoomId): Promise<CoreResult<void>>;
  invite(roomId: RoomId, userId: UserId, reason?: string): Promise<CoreResult<void>>;
  createRoom(params: CreateRoomParams): Promise<CoreResult<RoomId>>;
  upgrade(roomId: RoomId, params: RoomUpgradeParams): Promise<CoreResult<RoomId>>;
  searchDirectory(params: DirectorySearchParams): Promise<CoreResult<PublicRoomsResult>>;
  hierarchy(roomId: RoomId, params: HierarchyParams): Promise<CoreResult<PublicRoomsResult>>;
  state(roomId: RoomId, eventType: string, stateKey?: string): SnapshotStore<JsonObject | null>;
  stateList(roomId: RoomId, eventType: string): SnapshotStore<readonly RoomStateEntry[]>;
  sendState(
    roomId: RoomId,
    eventType: string,
    content: JsonObject,
    stateKey?: string
  ): Promise<CoreResult<void>>;
  getState(
    roomId: RoomId,
    eventType: string,
    stateKey: string
  ): Promise<CoreResult<JsonObject | null>>;
  children(roomId: RoomId): Promise<CoreResult<readonly RoomId[]>>;
};

export type TimelineModule = {
  timeline(roomId: RoomId): SnapshotStore<TimelineView>;
  paginateBackward(roomId: RoomId, limit: number): Promise<CoreResult<void>>;
};

export type PresenceModule = {
  presence(userId: string): SnapshotStore<PresenceView | null>;
  typing(roomId: RoomId): SnapshotStore<readonly string[]>;
};

export type HarrierCore = {
  readonly capabilities: CoreCapabilities;
  readonly auth: AuthModule;
  readonly rooms: RoomsModule;
  readonly timeline: TimelineModule;
  readonly presence: PresenceModule;
};
