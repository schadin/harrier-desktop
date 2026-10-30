import type { CoreError } from './error';
import type { SnapshotStore } from './snapshot';
import type {
  JsonObject,
  MemberView,
  RoomId,
  RoomSummaryView,
  RoomView,
  SessionView,
  SyncView,
  TimelineView,
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
  readonly list: SnapshotStore<readonly RoomSummaryView[]>;
  room(roomId: RoomId): SnapshotStore<RoomView | null>;
  members(roomId: RoomId): SnapshotStore<readonly MemberView[]>;
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

export type HarrierCore = {
  readonly capabilities: CoreCapabilities;
  readonly auth: AuthModule;
  readonly rooms: RoomsModule;
  readonly timeline: TimelineModule;
};
