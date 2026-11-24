import type { CoreError } from './error';
import type { IPowerLevels } from './permissions';
import type { SnapshotStore } from './snapshot';
import type {
  EventId,
  JsonObject,
  MemberView,
  PublicRoomView,
  RoomAccountDataEntry,
  RoomAliasesView,
  RoomStateEntry,
  RoomId,
  RoomSummaryView,
  RoomView,
  PresenceView,
  PresenceStatus,
  UserProfileView,
  DeviceTrust,
  DeviceView,
  VerificationRequestView,
  BackupStatusView,
  BackupProgressView,
  CallView,
  CapabilitiesView,
  AuthMetadataView,
  LoginFlowsView,
  LoginRequestView,
  LoginResponseView,
  PasswordResetResultView,
  RegistrationResultView,
  RequestTokenView,
  NotificationPreferencesView,
  NotificationPageView,
  ServerDiscoveryView,
  SsoActionView,
  RoomNotificationModeView,
  MediaConfigView,
  MessageSearchParamsView,
  MessageSearchResultView,
  MediaRef,
  MediaSourceView,
  UrlPreviewView,
  SessionView,
  SyncView,
  TimelineView,
  TimelineItem,
  SendStatusView,
  UploadView,
  UnreadMapEntry,
  UserId,
} from './views';

export type CoreCapabilities = {
  readonly calls: boolean;
  readonly threads: boolean;
};

export type CoreResult<T> = { ok: true; value: T } | { ok: false; error: CoreError };

export type AuthOperations = {
  discover(server: string): Promise<CoreResult<ServerDiscoveryView | null>>;
  login(baseUrl: string, request: LoginRequestView): Promise<CoreResult<LoginResponseView>>;
  loginFlows(baseUrl: string): Promise<CoreResult<LoginFlowsView>>;
  register(baseUrl: string, request: LoginRequestView): Promise<CoreResult<RegistrationResultView>>;
  requestEmailToken(
    baseUrl: string,
    email: string,
    clientSecret: string,
    sendAttempt: number,
    nextLink?: string
  ): Promise<CoreResult<RequestTokenView>>;
  requestRegisterEmailToken(
    baseUrl: string,
    email: string,
    clientSecret: string,
    sendAttempt: number,
    nextLink?: string
  ): Promise<CoreResult<RequestTokenView>>;
  setPassword(
    baseUrl: string,
    auth: JsonObject,
    newPassword: string,
    logoutDevices: boolean
  ): Promise<CoreResult<PasswordResetResultView>>;
  ssoUrl(
    baseUrl: string,
    redirectUrl: string,
    idProviderId?: string,
    action?: SsoActionView
  ): string | null;
  mediaUrl(baseUrl: string, mxcUrl: string): string | null;
};

export type AuthModule = {
  readonly session: SnapshotStore<SessionView | null>;
  accessToken(): string | null;
  readonly sync: SnapshotStore<SyncView>;
  readonly capabilities: SnapshotStore<CapabilitiesView>;
  readonly authMetadata: SnapshotStore<AuthMetadataView | null>;
  readonly accountDataTypes: SnapshotStore<readonly string[]>;
  accountData(type: string): SnapshotStore<JsonObject | null>;
  onAccountData(listener: (type: string, content: JsonObject) => void): () => void;
  setAccountData(type: string, content: JsonObject): Promise<CoreResult<void>>;
  refreshCapabilities(): Promise<CoreResult<void>>;
  refreshAuthMetadata(): Promise<CoreResult<void>>;
  start(): Promise<CoreResult<void>>;
  retrySync(): Promise<CoreResult<void>>;
  onLoggedOut(listener: () => void): () => void;
  stop(): Promise<void>;
  logout(): Promise<CoreResult<void>>;
  clearCache(): Promise<CoreResult<void>>;
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
  viaServers(roomId: RoomId): readonly string[];
  mutualRooms(userId: UserId): Promise<CoreResult<readonly RoomId[]>>;
  resolveAlias(alias: string): Promise<CoreResult<RoomId | null>>;
  aliases(roomId: RoomId): Promise<CoreResult<RoomAliasesView>>;
  createAlias(alias: string, roomId: RoomId): Promise<CoreResult<void>>;
  deleteAlias(alias: string): Promise<CoreResult<void>>;
  directoryVisibility(roomId: RoomId): Promise<CoreResult<'public' | 'private'>>;
  setDirectoryVisibility(
    roomId: RoomId,
    visibility: 'public' | 'private'
  ): Promise<CoreResult<void>>;
  searchMessages(
    params: MessageSearchParamsView,
    nextBatch?: string
  ): Promise<CoreResult<MessageSearchResultView>>;
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
  stateEntry(
    roomId: RoomId,
    eventType: string,
    stateKey?: string
  ): SnapshotStore<RoomStateEntry | null>;
  stateList(roomId: RoomId, eventType: string): SnapshotStore<readonly RoomStateEntry[]>;
  stateEntries(roomId: RoomId): SnapshotStore<readonly RoomStateEntry[]>;
  onState(
    listener: (
      entry: RoomStateEntry & { readonly roomId: RoomId; readonly eventType: string }
    ) => void
  ): () => void;
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
  markRead(roomId: RoomId, eventId: EventId, privateReceipt?: boolean): Promise<CoreResult<void>>;
  paginateBackward(roomId: RoomId, limit: number): Promise<CoreResult<void>>;
  paginateForward(roomId: RoomId, limit: number): Promise<CoreResult<void>>;
  focusEvent(roomId: RoomId, eventId: EventId): Promise<CoreResult<number>>;
  clearFocus(roomId: RoomId): void;
  event(roomId: RoomId, eventId: EventId): Promise<CoreResult<TimelineItem | null>>;
};

export type PresenceModule = {
  presence(userId: string): SnapshotStore<PresenceView | null>;
  profile(userId: string): SnapshotStore<UserProfileView>;
  refreshProfile(userId: string): Promise<CoreResult<void>>;
  typing(roomId: RoomId): SnapshotStore<readonly string[]>;
  setTyping(roomId: RoomId, typing: boolean, timeoutMs?: number): Promise<CoreResult<void>>;
  getOwnPresence(): Promise<CoreResult<PresenceView | null>>;
  setLocalOwnStatus(statusMessage?: string): void;
  setOwnPresence(input: {
    status: PresenceStatus;
    statusMessage?: string;
  }): Promise<CoreResult<void>>;
};

export type VerificationModule = {
  readonly incoming: SnapshotStore<VerificationRequestView | null>;
  request(deviceId: string): Promise<CoreResult<VerificationRequestView>>;
  view(id: string): SnapshotStore<VerificationRequestView | null>;
  accept(id: string): Promise<CoreResult<void>>;
  cancel(id: string): Promise<CoreResult<void>>;
  startSas(id: string): Promise<CoreResult<void>>;
  confirmSas(id: string): Promise<CoreResult<void>>;
  mismatchSas(id: string): Promise<CoreResult<void>>;
};

export type BackupModule = {
  readonly status: SnapshotStore<BackupStatusView>;
  readonly progress: SnapshotStore<BackupProgressView>;
  refreshStatus(): Promise<CoreResult<void>>;
  restore(): Promise<CoreResult<void>>;
  prepareAndRestore(): Promise<CoreResult<void>>;
  onDecryptionKeyCached(listener: () => void): () => void;
  decodeRecoveryKey(
    keyId: string,
    input: { recoveryKey?: string; passphrase?: string }
  ): Promise<CoreResult<void>>;
  unlockSecretStorage(): Promise<CoreResult<void>>;
  requestKey(roomId: RoomId, eventId: EventId): Promise<CoreResult<void>>;
  retryDecryption(): Promise<CoreResult<void>>;
};

export type MediaModule = {
  readonly config: SnapshotStore<MediaConfigView>;
  readonly authenticated: SnapshotStore<boolean>;
  resolve(ref: MediaRef): Promise<CoreResult<MediaSourceView>>;
  thumbnail(ref: MediaRef): Promise<CoreResult<MediaSourceView>>;
  download(ref: MediaRef, filename: string): Promise<CoreResult<Blob>>;
  getUrlPreview(url: string, ts: number): Promise<CoreResult<UrlPreviewView>>;
  refreshConfig(): Promise<CoreResult<void>>;
};

export type NotificationsModule = {
  readonly preferences: SnapshotStore<NotificationPreferencesView>;
  readonly pushRules: SnapshotStore<JsonObject>;
  setPushRuleActions(
    kind: string,
    ruleId: string,
    actions: readonly unknown[]
  ): Promise<CoreResult<void>>;
  addPushRule(
    kind: string,
    ruleId: string,
    actions: readonly unknown[],
    options?: { conditions?: readonly unknown[]; pattern?: string }
  ): Promise<CoreResult<void>>;
  deletePushRule(kind: string, ruleId: string): Promise<CoreResult<void>>;
  setPusher(pusher: JsonObject): Promise<CoreResult<void>>;
  emailNotifications(): Promise<CoreResult<{ readonly enabled: boolean; readonly email?: string }>>;
  setRoomMode(
    roomId: RoomId,
    mode: RoomNotificationModeView,
    previousMode: RoomNotificationModeView
  ): Promise<CoreResult<void>>;
  refreshPreferences(): Promise<CoreResult<void>>;
  list(
    from?: string,
    limit?: number,
    onlyHighlight?: boolean
  ): Promise<CoreResult<NotificationPageView>>;
};

export type CallsModule = {
  readonly active: SnapshotStore<readonly CallView[]>;
  session(roomId: RoomId): SnapshotStore<CallView | null>;
  join(roomId: RoomId): Promise<CoreResult<void>>;
  leave(roomId: RoomId): Promise<CoreResult<void>>;
};

export type CryptoModule = {
  readonly devices: SnapshotStore<readonly DeviceView[] | null>;
  readonly verification: VerificationModule;
  readonly backup: BackupModule;
  refreshDevices(): Promise<CoreResult<void>>;
  trust(userId: string, deviceId: string): SnapshotStore<DeviceTrust>;
  unverifiedCount(userId: string, deviceIds: readonly string[]): SnapshotStore<number | undefined>;
  renameDevice(deviceId: string, displayName: string): Promise<CoreResult<void>>;
  deleteDevices(deviceIds: readonly string[], auth?: JsonObject): Promise<CoreResult<void>>;
};

export type SendModule = {
  sendMessage(roomId: RoomId, content: JsonObject): Promise<CoreResult<string>>;
  sendEvent(roomId: RoomId, eventType: string, content: JsonObject): Promise<CoreResult<string>>;
  edit(roomId: RoomId, eventId: EventId, content: JsonObject): Promise<CoreResult<string>>;
  reaction(
    roomId: RoomId,
    eventId: EventId,
    key: string,
    shortcode?: string
  ): Promise<CoreResult<string>>;
  redact(roomId: RoomId, eventId: EventId, reason?: string): Promise<CoreResult<string>>;
  cancel(localId: string): Promise<CoreResult<void>>;
  resend(localId: string): Promise<CoreResult<void>>;
  status(localId: string): SnapshotStore<SendStatusView | null>;
};

export type UploadModule = {
  start(input: { filename: string; contentType?: string; data: ArrayBuffer }): CoreResult<string>;
  cancel(localId: string): Promise<CoreResult<void>>;
  status(localId: string): SnapshotStore<UploadView | null>;
};

export type HarrierCore = {
  readonly capabilities: CoreCapabilities;
  readonly auth: AuthModule;
  readonly rooms: RoomsModule;
  readonly timeline: TimelineModule;
  readonly presence: PresenceModule;
  readonly crypto: CryptoModule;
  readonly notifications: NotificationsModule;
  readonly media: MediaModule;
  readonly calls?: CallsModule;
  readonly send: SendModule;
  readonly uploads: UploadModule;
};
