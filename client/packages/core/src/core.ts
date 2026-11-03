import type { CoreError } from './error';
import type { IPowerLevels } from './permissions';
import type { SnapshotStore } from './snapshot';
import type {
  JsonObject,
  MemberView,
  RoomAccountDataEntry,
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

export type RoomsModule = {
  readonly all: SnapshotStore<readonly RoomSummaryView[]>;
  readonly list: SnapshotStore<readonly RoomSummaryView[]>;
  readonly unreads: SnapshotStore<readonly UnreadMapEntry[]>;
  room(roomId: RoomId): SnapshotStore<RoomView | null>;
  members(roomId: RoomId): SnapshotStore<readonly MemberView[]>;
  powerLevels(roomId: RoomId): SnapshotStore<IPowerLevels>;
  creators(roomId: RoomId): SnapshotStore<readonly string[]>;
  accountData(roomId: RoomId): SnapshotStore<readonly RoomAccountDataEntry[]>;
  parents(roomId: RoomId): SnapshotStore<readonly RoomId[]>;
  join(roomIdOrAlias: string, viaServers?: readonly string[]): Promise<CoreResult<RoomId>>;
  leave(roomId: RoomId): Promise<CoreResult<void>>;
  invite(roomId: RoomId, userId: UserId, reason?: string): Promise<CoreResult<void>>;
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
