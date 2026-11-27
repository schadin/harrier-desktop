/* eslint-disable max-classes-per-file */
import {
  ClientEvent,
  createClient,
  EventStatus,
  EventTimeline,
  type IEvent,
  MatrixClient,
  MatrixError,
  type RoomState,
  MatrixEvent,
  ReceiptType,
  Room,
  NotificationCountType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  User,
  MatrixEventEvent,
} from 'matrix-js-sdk';
import {
  ImportRoomKeyStage,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type CryptoApi,
  type VerificationRequest,
  DecryptionFailureCode,
} from 'matrix-js-sdk/lib/crypto-api';
import {
  DecryptionError,
  type EventDecryptionResult,
} from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import type { DecryptionFailureCode as CoreDecryptionFailureCode } from '@harrier/core';

export const TEST_USER_ID = '@tester:example.org';
const DIRECT_PARTNER_ID = '@alice:example.org';
const DEFAULT_ROOM_SUMMARY_RESPONSE = {
  room_id: '!federated:remote.example',
  name: 'Federated Room',
  avatar_url: 'mxc://remote.example/avatar',
  topic: 'Federated topic',
  num_joined_members: 17,
  room_type: 'm.space',
  membership: 'leave',
  'im.nheko.summary.room_version': '12',
  'im.nheko.summary.encryption': 'm.megolm.v1.aes-sha2',
};

export type SyncFixtureReaction = {
  readonly eventId: string;
  readonly target: string;
  readonly sender: string;
  readonly key: string;
  readonly shortcode?: string;
  readonly redacted?: boolean;
  readonly redactionReason?: string;
  readonly redactionEventId?: string;
};

export type SyncFixtureRedaction = {
  readonly eventId: string;
  readonly reason?: string;
  readonly redactionEventId?: string;
};

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
  readonly failureCode?: CoreDecryptionFailureCode;
  readonly decryptedContent?: Record<string, unknown>;
  readonly decryptedType?: string;
  readonly eventType?: string;
  readonly content?: Record<string, unknown>;
  readonly unsigned?: Record<string, unknown>;
  readonly redactionReason?: string;
  readonly redactionEventId?: string;
  readonly threadRoot?: string;
  readonly timestamp?: number;
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
  readonly eventOrder?: readonly string[];
  readonly reactions?: readonly SyncFixtureReaction[];
  readonly redactions?: readonly SyncFixtureRedaction[];
  readonly receipts?: readonly { readonly eventId: string; readonly userId: string }[];
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
  readonly displayName?: string;
  readonly avatarUrl?: string;
  readonly statusMessage?: string;
  readonly active?: boolean;
  readonly lastActiveTs?: number;
};

export type SyncFixtureNotification = {
  readonly roomId: string;
  readonly event?: {
    readonly eventId?: string;
    readonly sender?: string;
    readonly type?: string;
    readonly content?: Record<string, unknown>;
    readonly unsigned?: Record<string, unknown>;
    readonly timestamp?: number;
  };
  readonly timestamp?: number;
  readonly read?: boolean;
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
  readonly notifications?: readonly SyncFixtureNotification[];
  readonly presence?: readonly SyncFixturePresence[];
  readonly devices?: readonly {
    readonly deviceId: string;
    readonly displayName?: string;
    readonly lastSeenIp?: string;
    readonly lastSeenTs?: number;
  }[];
  readonly threepids?: unknown;
};

export type SyncOperationFailure = {
  readonly httpStatus: number;
  readonly errcode?: string;
  readonly error?: string;
  readonly retryAfterMs?: number;
  readonly data?: Record<string, unknown>;
};

export type FakeTransportCall = {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
};

export type SyncDriverOptions = {
  readonly crypto?: boolean;
};

export type SyncDriver = {
  readonly client: MatrixClient;
  readonly cryptoCalls: readonly string[];
  readonly importedKeysJson: string | undefined;
  applyFixture(fixture: SyncFixture): Promise<void>;
  failNextOperation(operation: string, failure: SyncOperationFailure): void;
  setRoomSummaryResponse(roomIdOrAlias: string, response: unknown): void;
  setThirdPartyProtocolsResponse(response: unknown): void;
  setExportedRoomKeysJson(keysJson: string): void;
  setKeyBackupInfo(info: Record<string, unknown> | null): void;
  setActiveSessionBackupVersion(version: string | undefined): void;
  setKeyBackupTrust(trust: { trusted: boolean; matchesDecryptionKey: boolean }): void;
  queueDecryption(
    eventId: string,
    clear?: { readonly type: string; readonly content: Record<string, unknown> },
    failureCode?: CoreDecryptionFailureCode
  ): void;
  decryptEvent(eventId: string): Promise<boolean>;
  getCalls(): readonly FakeTransportCall[];
};

let eventCounter = 0;

function stateEvent(
  roomId: string,
  type: string,
  stateKey: string,
  content: Record<string, unknown>
): MatrixEvent {
  eventCounter += 1;
  return new MatrixEvent({
    type,
    state_key: stateKey,
    sender: TEST_USER_ID,
    room_id: roomId,
    event_id: `$fixture${eventCounter}`,
    origin_server_ts: 1_700_000_000_000 + eventCounter,
    content,
  });
}

function redactionEvent(
  roomId: string,
  sender: string,
  reason?: string,
  eventId = '$redaction'
): IEvent {
  return {
    type: 'm.room.redaction',
    event_id: eventId,
    room_id: roomId,
    sender,
    origin_server_ts: 1_700_000_000_000,
    content: { ...(reason !== undefined ? { reason } : {}) },
  } as IEvent;
}

function messageEvent(roomId: string, message: SyncFixtureMessage): MatrixEvent {
  const relation: Record<string, unknown> = {};
  if (message.replaces !== undefined) {
    relation.rel_type = 'm.replace';
    relation.event_id = message.replaces;
  }
  if (message.replyTo !== undefined) {
    relation['m.in_reply_to'] = { event_id: message.replyTo };
  }
  if (message.threadRoot !== undefined) {
    relation.rel_type = 'm.thread';
    relation.event_id = message.threadRoot;
    relation['m.in_reply_to'] = { event_id: message.threadRoot };
  }

  const content: Record<string, unknown> = message.encrypted
    ? {
        algorithm: 'm.megolm.v1.aes-sha2',
        ciphertext: message.body,
        ...(Object.keys(relation).length > 0 ? { 'm.relates_to': relation } : {}),
      }
    : {
        msgtype: message.msgtype ?? 'm.text',
        body: message.body,
        ...(message.formattedBody !== undefined
          ? { formatted_body: message.formattedBody, format: 'org.matrix.custom.html' }
          : {}),
        ...(message.url !== undefined ? { url: message.url } : {}),
        ...(message.filename !== undefined ? { filename: message.filename } : {}),
        ...(message.info !== undefined ? { info: message.info } : {}),
        ...(message.replaces !== undefined
          ? {
              'm.new_content': {
                msgtype: message.msgtype ?? 'm.text',
                body: message.body,
                ...(message.formattedBody !== undefined
                  ? {
                      formatted_body: message.formattedBody,
                      format: 'org.matrix.custom.html',
                    }
                  : {}),
              },
            }
          : {}),
        ...(Object.keys(relation).length > 0 ? { 'm.relates_to': relation } : {}),
      };
  Object.assign(content, message.content ?? {});
  if (message.redacted) Object.keys(content).forEach((key) => delete content[key]);
  eventCounter += 1;
  const event = new MatrixEvent({
    type: message.encrypted ? 'm.room.encrypted' : message.eventType ?? 'm.room.message',
    sender: message.sender,
    room_id: roomId,
    event_id: message.eventId,
    origin_server_ts: message.timestamp ?? 1_700_000_000_000 + eventCounter,
    content,
    unsigned:
      message.redacted ||
      message.redactionReason !== undefined ||
      message.redactionEventId !== undefined
        ? {
            ...(message.unsigned ?? {}),
            redacted_because: redactionEvent(
              roomId,
              message.sender,
              message.redactionReason,
              message.redactionEventId
            ),
          }
        : { ...(message.unsigned ?? {}) },
  });
  const statusByFixture: Record<string, EventStatus> = {
    sending: EventStatus.SENDING,
    failed: EventStatus.NOT_SENT,
    sent: EventStatus.SENT,
  };
  event.setStatus(statusByFixture[message.status ?? 'sent']);
  return event;
}

function reactionEvent(roomId: string, reaction: SyncFixtureReaction): MatrixEvent {
  eventCounter += 1;
  return new MatrixEvent({
    type: 'm.reaction',
    sender: reaction.sender,
    room_id: roomId,
    event_id: reaction.eventId,
    origin_server_ts: 1_700_000_000_000 + eventCounter,
    content: reaction.redacted
      ? {}
      : {
          'm.relates_to': {
            rel_type: 'm.annotation',
            event_id: reaction.target,
            key: reaction.key,
          },
          ...(reaction.shortcode !== undefined ? { shortcode: reaction.shortcode } : {}),
        },
    unsigned:
      reaction.redacted ||
      reaction.redactionReason !== undefined ||
      reaction.redactionEventId !== undefined
        ? {
            redacted_because: redactionEvent(
              roomId,
              reaction.sender,
              reaction.redactionReason,
              reaction.redactionEventId
            ),
          }
        : {},
  });
}

class FakeEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeListener(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }

  protected emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

class FakeVerifier extends FakeEmitter {
  async verify() {
    this.emit(VerifierEvent.ShowSas, {
      sas: { emoji: [['🐱', 'Cat']] },
      confirm: async () => undefined,
      mismatch: () => undefined,
      cancel: () => undefined,
    });
  }
}

class FakeVerificationRequest extends FakeEmitter {
  phase = VerificationPhase.Requested;

  verifier: FakeVerifier | undefined;

  readonly initiatedByMe = true;

  readonly otherUserId = TEST_USER_ID;

  readonly otherDeviceId = 'DEVICE1';

  readonly isSelfVerification = true;

  async accept() {
    this.phase = VerificationPhase.Ready;
    this.emit(VerificationRequestEvent.Change);
  }

  async startVerification() {
    this.verifier = new FakeVerifier();
    this.phase = VerificationPhase.Started;
    this.emit(VerificationRequestEvent.Change);
    return this.verifier;
  }

  async cancel() {
    this.phase = VerificationPhase.Cancelled;
    this.emit(VerificationRequestEvent.Change);
  }
}

const DEFAULT_EXPORTED_ROOM_KEYS =
  '{\n  "algorithm": "m.megolm.v1.aes-sha2",\n  "note": "ключ 🔐",\n  "rooms": {}\n}\n';

type FakeCryptoState = {
  exportedRoomKeysJson: string;
  importedKeysJson: string | undefined;
  activeSessionBackupVersion: string | undefined;
  keyBackupInfo: Record<string, unknown> | null;
  keyBackupTrust: { trusted: boolean; matchesDecryptionKey: boolean };
};

type FakeClearEvent = { readonly type: string; readonly content: Record<string, unknown> };

const createFakeCrypto = (
  state: FakeCryptoState,
  cryptoCalls: string[],
  failOperation: (operation: string) => void
) => {
  const clearEvents = new Map<string, FakeClearEvent>();
  const failureQueues = new Map<string, DecryptionFailureCode[]>();
  const crypto = {
    getDeviceVerificationStatus: async () => ({ crossSigningVerified: false }),
    getOwnDeviceKeys: async () => ({ ed25519: 'ed25519-test-key' }),
    requestDeviceVerification: async () =>
      new FakeVerificationRequest() as unknown as VerificationRequest,
    exportRoomKeysAsJson: async () => {
      cryptoCalls.push('crypto.exportRoomKeys');
      failOperation('crypto.exportRoomKeys');
      return state.exportedRoomKeysJson;
    },
    importRoomKeysAsJson: async (keysJson: string) => {
      cryptoCalls.push('crypto.importRoomKeys');
      failOperation('crypto.importRoomKeys');
      Object.assign(state, { importedKeysJson: keysJson });
    },
    getActiveSessionBackupVersion: async () => {
      cryptoCalls.push('crypto.backup.getActiveSessionBackupVersion');
      failOperation('crypto.backup.refreshStatus');
      return state.activeSessionBackupVersion;
    },
    getKeyBackupInfo: async () => {
      cryptoCalls.push('crypto.backup.getKeyBackupInfo');
      failOperation('crypto.backup.refreshStatus');
      return state.keyBackupInfo;
    },
    isKeyBackupTrusted: async () => {
      cryptoCalls.push('crypto.backup.isKeyBackupTrusted');
      failOperation('crypto.backup.refreshStatus');
      return state.keyBackupTrust;
    },
    resetKeyBackup: async () => {
      cryptoCalls.push('crypto.backup.reset');
      failOperation('crypto.backup.reset');
      Object.assign(state, {
        activeSessionBackupVersion: '2',
        keyBackupInfo: { version: '2', count: 0 },
      });
    },
    restoreKeyBackup: async (options?: { progressCallback?: (progress: unknown) => void }) => {
      options?.progressCallback?.({ stage: ImportRoomKeyStage.Fetch });
      options?.progressCallback?.({
        stage: ImportRoomKeyStage.LoadKeys,
        total: 1,
        successes: 1,
        failures: 0,
      });
      return { total: 1, successes: 1, failures: 0 };
    },
    bootstrapSecretStorage: async () => undefined,
    loadSessionBackupPrivateKeyFromSecretStorage: async () => undefined,
    bootstrapCrossSigning: async () => undefined,
    decryptEvent: async (event: MatrixEvent): Promise<EventDecryptionResult> => {
      const eventId = event.getId() ?? '';
      const failureCode = failureQueues.get(eventId)?.shift();
      if (failureCode) {
        throw new DecryptionError(failureCode, `Fake decryption failure: ${failureCode}`);
      }
      const clear = clearEvents.get(eventId);
      if (!clear) {
        throw new DecryptionError(
          DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID,
          'No fake decryption data'
        );
      }
      return { clearEvent: clear };
    },
  } as unknown as CryptoApi;

  return {
    crypto,
    queueDecryption(
      eventId: string,
      clear?: FakeClearEvent,
      failureCode?: CoreDecryptionFailureCode
    ) {
      if (clear) clearEvents.set(eventId, clear);
      if (failureCode) {
        const queue = failureQueues.get(eventId) ?? [];
        queue.push(failureCode as DecryptionFailureCode);
        failureQueues.set(eventId, queue);
      }
    },
  };
};

export function createSyncDriver(options: SyncDriverOptions = {}): SyncDriver {
  const client = createClient({
    baseUrl: 'https://matrix.example.org',
    userId: TEST_USER_ID,
    accessToken: 'test-token',
    timelineSupport: true,
  });
  const operationFailures: Array<{ operation: string; failure: SyncOperationFailure }> = [];
  const takeOperationFailure = (
    matches: (operation: string) => boolean
  ): SyncOperationFailure | undefined => {
    const index = operationFailures.findIndex(({ operation }) => matches(operation));
    if (index < 0) return undefined;
    const [{ failure }] = operationFailures.splice(index, 1);
    return failure;
  };
  const throwOperationFailure = (failure: SyncOperationFailure | undefined) => {
    if (!failure) return;
    const data = {
      ...failure.data,
      ...(failure.errcode !== undefined ? { errcode: failure.errcode } : {}),
      ...(failure.error !== undefined ? { error: failure.error } : {}),
    };
    const error = new MatrixError(data, failure.httpStatus);
    if (failure.retryAfterMs !== undefined) {
      Object.assign(error, { retryAfterMs: failure.retryAfterMs });
    }
    throw error;
  };
  const failMatchingOperation = (path: string) => {
    throwOperationFailure(takeOperationFailure((operation) => path.includes(operation)));
  };
  const failNamedOperation = (operation: string) => {
    throwOperationFailure(takeOperationFailure((queued) => queued === operation));
  };
  const cryptoCalls: string[] = [];
  const cryptoState: FakeCryptoState = {
    exportedRoomKeysJson: DEFAULT_EXPORTED_ROOM_KEYS,
    importedKeysJson: undefined,
    activeSessionBackupVersion: undefined,
    keyBackupInfo: null,
    keyBackupTrust: { trusted: false, matchesDecryptionKey: false },
  };
  const fakeCrypto = createFakeCrypto(cryptoState, cryptoCalls, failNamedOperation);
  const crypto = options.crypto === false ? undefined : fakeCrypto.crypto;
  // The SDK applies threadSupport in startClient; fixtures need the same mode before sync starts.
  (client as unknown as { clientOpts: { threadSupport: boolean } }).clientOpts = {
    threadSupport: true,
  };
  let devices: readonly {
    deviceId: string;
    displayName?: string;
    lastSeenIp?: string;
    lastSeenTs?: number;
  }[] = [];
  client.getDevices = (async () => ({
    devices: devices.map((device) => ({
      device_id: device.deviceId,
      ...(device.displayName !== undefined ? { display_name: device.displayName } : {}),
      ...(device.lastSeenIp !== undefined ? { last_seen_ip: device.lastSeenIp } : {}),
      ...(device.lastSeenTs !== undefined ? { last_seen_ts: device.lastSeenTs } : {}),
    })),
  })) as typeof client.getDevices;
  client.getCrypto = (() => crypto) as typeof client.getCrypto;
  let notifications: readonly SyncFixtureNotification[] = [];
  const directRooms = new Set<string>();
  const sendFailRooms = new Set<string>();
  const sendAttempts = new Map<string, number>();
  const knownEvents = new Map<string, Record<string, unknown>>();
  const historyByRoom = new Map<string, SyncFixtureRoom['history']>();
  const roomSummaryResponses = new Map<string, unknown>();
  const calls: FakeTransportCall[] = [];
  let threepids: unknown = [];
  let thirdPartyProtocolsResponse: unknown = {
    'org.example.bridge': {
      user_fields: ['@alice:example.org'],
      location_fields: ['!room:example.org'],
      icon: 'mxc://example.org/bridge',
      field_types: { token: { regexp: '^[a-z]+$', placeholder: 'Token' } },
      instances: [
        {
          instance_id: 'bridge-one',
          desc: 'Example Bridge',
          network_id: 'matrix',
          icon: 'mxc://example.org/bridge-one',
          fields: { token: 'example' },
        },
      ],
    },
    'org.example.irc': {
      user_fields: [],
      location_fields: ['#channel:example.org'],
      field_types: {},
      instances: [
        {
          instance_id: 'irc-one',
          desc: 'Example IRC',
          network_id: 'irc',
          fields: {},
        },
      ],
    },
  };
  client.getAuthMetadata = (async () => undefined) as unknown as typeof client.getAuthMetadata;
  client.getVersions = (async () => ({
    versions: ['v1.11'],
    unstable_features: {},
  })) as typeof client.getVersions;
  const ensureOwnUser = () => {
    const existing = client.getUser(TEST_USER_ID);
    if (existing) return existing;
    const user = User.createUser(TEST_USER_ID, client);
    user.setDisplayName('');
    client.store.storeUser(user);
    return user;
  };
  client.http.authedRequest = (async (
    method: string,
    path: string,
    query?: Record<string, unknown>,
    body?: unknown
  ) => {
    calls.push({
      method,
      path,
      ...(query !== undefined ? { query } : {}),
      ...(body !== undefined ? { body } : {}),
    });
    failMatchingOperation(path);
    if (method === 'PUT' && /^\/profile\/[^/]+\/displayname$/.test(path)) {
      ensureOwnUser();
      return {};
    }
    if (method === 'PUT' && /^\/profile\/[^/]+\/avatar_url$/.test(path)) {
      ensureOwnUser();
      return {};
    }
    if (method === 'GET' && path === '/account/3pid') return { threepids };
    if (path.endsWith('/logout')) return {};
    if (path.includes('/join/')) {
      return { room_id: decodeURIComponent(path.split('/join/')[1]?.split('/')[0] ?? '') };
    }
    if (path.endsWith('/leave')) return {};
    if (path.includes('/upload')) return { content_uri: 'mxc://example.org/uploaded' };
    if (path.includes('/presence/')) return {};
    if (path.includes('/devices/') || path.endsWith('/delete_devices')) return {};
    if (path.includes('/pushrules/')) return {};
    if (path.endsWith('/config') || path.includes('/media/config')) return {};
    if (path.includes('/preview_url')) return {};
    if (path.includes('/notifications')) {
      return {
        notifications: notifications.map((notification) => ({
          room_id: notification.roomId,
          ...(notification.event
            ? {
                event: {
                  ...(notification.event.eventId !== undefined
                    ? { event_id: notification.event.eventId }
                    : {}),
                  ...(notification.event.sender !== undefined
                    ? { sender: notification.event.sender }
                    : {}),
                  ...(notification.event.type !== undefined
                    ? { type: notification.event.type }
                    : {}),
                  ...(notification.event.content !== undefined
                    ? { content: notification.event.content }
                    : {}),
                  ...(notification.event.unsigned !== undefined
                    ? { unsigned: notification.event.unsigned }
                    : {}),
                  ...(notification.event.timestamp !== undefined
                    ? { origin_server_ts: notification.event.timestamp }
                    : {}),
                },
              }
            : {}),
          ...(notification.timestamp !== undefined ? { ts: notification.timestamp } : {}),
          ...(notification.read !== undefined ? { read: notification.read } : {}),
        })),
        next_token: 't1',
      };
    }
    if (path.includes('/capabilities')) return {};
    if (path.endsWith('/search')) {
      return { search_categories: { room_events: { results: [], highlights: [] } } };
    }
    if (path.includes('/receipt/')) return {};
    if (path.includes('/typing/')) return {};
    if (path.includes('/send/')) {
      const roomId = decodeURIComponent(path.split('/rooms/')[1]?.split('/')[0] ?? '');
      const attempts = (sendAttempts.get(roomId) ?? 0) + 1;
      sendAttempts.set(roomId, attempts);
      if (sendFailRooms.has(roomId) && attempts === 1) {
        const error = new Error('Send failed') as Error & { httpStatus: number };
        error.httpStatus = 403;
        throw error;
      }
      const txnId = path.split('/').pop() ?? '';
      return { event_id: `$sent-${txnId}` };
    }
    if (method === 'POST' && /^\/rooms\/[^/]+\/(kick|ban|unban)$/.test(path)) return {};
    if (method === 'POST' && /^\/rooms\/[^/]+\/report\/[^/]+$/.test(path)) return {};
    if (method === 'POST' && /^\/rooms\/[^/]+\/report$/.test(path)) return {};
    if (path.endsWith('/invite')) return {};
    if (path.endsWith('/createRoom')) return { room_id: '!created:example.org' };
    if (path.endsWith('/upgrade')) return { replacement_room: '!upgraded:example.org' };
    if (path.includes('/state/')) return {};
    if (path.includes('/account_data/')) return {};
    if (path.endsWith('/publicRooms')) {
      return {
        chunk: [
          {
            room_id: '!public:example.org',
            name: 'Public Room',
            topic: 'A public room',
            avatar_url: 'mxc://example.org/public-avatar',
            canonical_alias: '#public:example.org',
            num_joined_members: 42,
            room_type: undefined,
            world_readable: true,
            guest_can_join: false,
          },
        ],
        next_batch: 'page-2',
      };
    }
    if (path.endsWith('/hierarchy')) {
      return {
        rooms: [
          {
            room_id: '!child:example.org',
            name: 'Child Room',
            topic: undefined,
            avatar_url: undefined,
            canonical_alias: undefined,
            num_joined_members: 7,
            children_state: [],
            guest_can_join: true,
            world_readable: false,
          },
        ],
        next_batch: undefined,
      };
    }
    const summaryMatch = /^\/summary\/(.+)$/.exec(path);
    if (summaryMatch) {
      const roomIdOrAlias = decodeURIComponent(summaryMatch[1]);
      return roomSummaryResponses.has(roomIdOrAlias)
        ? roomSummaryResponses.get(roomIdOrAlias)
        : DEFAULT_ROOM_SUMMARY_RESPONSE;
    }
    const fallbackSummaryMatch = /^\/rooms\/([^/]+)\/summary$/.exec(path);
    if (fallbackSummaryMatch) {
      const roomIdOrAlias = decodeURIComponent(fallbackSummaryMatch[1]);
      return roomSummaryResponses.has(roomIdOrAlias)
        ? roomSummaryResponses.get(roomIdOrAlias)
        : DEFAULT_ROOM_SUMMARY_RESPONSE;
    }
    if (path === '/thirdparty/protocols') return thirdPartyProtocolsResponse;
    if (path.includes('/context/')) {
      const eventId = decodeURIComponent(path.split('/context/')[1]?.split('/')[0] ?? '');
      const raw = knownEvents.get(eventId);
      if (!raw) {
        const error = new Error('Event not found') as Error & { httpStatus: number };
        error.httpStatus = 404;
        throw error;
      }
      return {
        start: 'ctx-start',
        end: 'ctx-end',
        event: raw,
        events_before: [],
        events_after: [],
        state: [],
      };
    }
    if (path.endsWith('/messages')) {
      const roomId = decodeURIComponent(path.split('/rooms/')[1]?.split('/')[0] ?? '');
      const history = historyByRoom.get(roomId);
      if (!history) throw new Error(`No fake history for ${roomId}`);
      return {
        start: typeof query?.from === 'string' ? query.from : 't0',
        end: history.nextToken,
        chunk: history.messages.map((message) => messageEvent(roomId, message).event),
      };
    }
    throw new Error(`Unexpected fake request: ${path}`);
  }) as typeof client.http.authedRequest;

  const publishDirectRooms = () => {
    const event = new MatrixEvent({
      type: 'm.direct',
      content: { [DIRECT_PARTNER_ID]: [...directRooms] },
    });
    client.store.storeAccountDataEvents([event]);
    client.emit(ClientEvent.AccountData, event);
  };

  const rememberEvent = (event: MatrixEvent) => {
    const eventId = event.getId();
    if (eventId)
      knownEvents.set(eventId, JSON.parse(JSON.stringify(event.event)) as Record<string, unknown>);
  };
  const registerFixtureDecryption = (message: SyncFixtureMessage) => {
    if (!message.encrypted) return;
    const legacyFailures: Record<
      NonNullable<SyncFixtureMessage['failure']>,
      DecryptionFailureCode
    > = {
      'missing-keys': DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID,
      'unknown-device': DecryptionFailureCode.UNKNOWN_SENDER_DEVICE,
      unknown: DecryptionFailureCode.UNKNOWN_ERROR,
    };
    const legacyFailure = message.failure ? legacyFailures[message.failure] : undefined;
    if (message.decryptedContent !== undefined || message.decryptedType !== undefined) {
      fakeCrypto.queueDecryption(message.eventId, {
        type: message.decryptedType ?? 'm.room.message',
        content: message.decryptedContent ?? {},
      });
    }
    const failureCode = message.failureCode ?? legacyFailure;
    if (failureCode !== undefined)
      fakeCrypto.queueDecryption(message.eventId, undefined, failureCode);
  };
  const decryptKnownEvent = async (eventId: string): Promise<boolean> => {
    const event = client
      .getRooms()
      .flatMap((room) => room.findEventById(eventId) ?? [])
      .find(Boolean);
    if (
      !event?.isEncrypted() ||
      (!event.shouldAttemptDecryption() && !event.isDecryptionFailure())
    ) {
      return false;
    }
    await event.attemptDecryption(fakeCrypto.crypto as never);
    client.emit(MatrixEventEvent.Decrypted, event);
    return true;
  };
  const redactExistingEvent = (
    room: Room,
    eventId: string,
    reason?: string,
    redactionEventId?: string
  ) => {
    const target = room.findEventById(eventId);
    if (!target) return;
    const redaction = new MatrixEvent(
      redactionEvent(room.roomId, target.getSender() ?? TEST_USER_ID, reason, redactionEventId)
    );
    target.makeRedacted(redaction, room);
    rememberEvent(target);
    client.emit(RoomEvent.Redaction, redaction, room, target.threadRootId);
  };

  const applyRoom = async (item: SyncFixtureRoom) => {
    const existingRoom = client.getRoom(item.roomId);
    const room =
      existingRoom ?? new Room(item.roomId, client, TEST_USER_ID, { timelineSupport: true });
    if (!existingRoom) client.store.storeRoom(room);
    room.updateMyMembership(item.membership);
    const states: MatrixEvent[] = [];
    if (item.name !== undefined) {
      states.push(stateEvent(item.roomId, 'm.room.name', '', { name: item.name }));
    }
    if (
      item.space ||
      item.roomType !== undefined ||
      item.roomVersion !== undefined ||
      item.additionalCreators !== undefined
    ) {
      states.push(
        stateEvent(item.roomId, 'm.room.create', '', {
          ...(item.space ? { type: 'm.space' } : {}),
          ...(item.roomType !== undefined ? { type: item.roomType } : {}),
          ...(item.roomVersion !== undefined ? { room_version: item.roomVersion } : {}),
          ...(item.additionalCreators !== undefined
            ? { additional_creators: [...item.additionalCreators] }
            : {}),
        })
      );
    }
    if (item.powerLevels !== undefined) {
      states.push(stateEvent(item.roomId, 'm.room.power_levels', '', item.powerLevels));
    }
    if (item.topic !== undefined) {
      states.push(stateEvent(item.roomId, 'm.room.topic', '', { topic: item.topic }));
    }
    if (item.encrypted) {
      states.push(
        stateEvent(item.roomId, 'm.room.encryption', '', { algorithm: 'm.megolm.v1.aes-sha2' })
      );
    }
    (item.stateEvents ?? []).forEach((stateEventItem) => {
      states.push(
        stateEvent(
          item.roomId,
          stateEventItem.type,
          stateEventItem.stateKey,
          stateEventItem.content
        )
      );
    });
    (item.members ?? []).forEach((member) => {
      states.push(
        stateEvent(item.roomId, 'm.room.member', member.userId, {
          membership: member.membership ?? 'join',
          displayname: member.displayName,
          ...(member.avatarUrl !== undefined ? { avatar_url: member.avatarUrl } : {}),
        })
      );
    });
    (item.children ?? []).forEach((childId) => {
      states.push(stateEvent(item.roomId, 'm.space.child', childId, { via: ['example.org'] }));
    });
    (item.typing ?? []).forEach((userId) => {
      states.push(
        stateEvent(item.roomId, 'm.room.member', userId, {
          membership: 'join',
          displayname: userId,
        })
      );
    });
    if (states.length > 0) {
      const forwardStateEvent = (
        event: MatrixEvent,
        state: RoomState,
        previousEvent: MatrixEvent | null
      ) => {
        client.emit(RoomStateEvent.Events, event, state, previousEvent);
      };
      const forwardStateUpdate = () => {
        client.emit(RoomStateEvent.Update, room.currentState);
      };
      room.currentState.on(RoomStateEvent.Events, forwardStateEvent);
      room.currentState.on(RoomStateEvent.Update, forwardStateUpdate);
      try {
        room.currentState.setStateEvents(states);
      } finally {
        room.currentState.removeListener(RoomStateEvent.Events, forwardStateEvent);
        room.currentState.removeListener(RoomStateEvent.Update, forwardStateUpdate);
      }
    }
    if (item.accountData) {
      Object.entries(item.accountData).forEach(([type, content]) => {
        eventCounter += 1;
        const event = new MatrixEvent({
          type,
          room_id: item.roomId,
          event_id: `$accountData${eventCounter}`,
          origin_server_ts: 1_700_000_000_000 + eventCounter,
          content,
        });
        room.accountData.set(type, event);
        client.emit(RoomEvent.AccountData, event, room, undefined);
      });
    }
    if (item.direct) directRooms.add(item.roomId);
    if (item.sendFails) sendFailRooms.add(item.roomId);
    // SyncApi.injectRoomEvents awaits timeline processing before the final recalculate.
    await Promise.resolve();
    const forwardRoomName = () => {
      client.emit(RoomEvent.Name, room);
    };
    room.on(RoomEvent.Name, forwardRoomName);
    try {
      room.recalculate();
    } finally {
      room.removeListener(RoomEvent.Name, forwardRoomName);
    }
    if (!existingRoom) client.emit(ClientEvent.Room, room);
    states.forEach((event) => {
      client.emit(ClientEvent.Event, event);
    });

    const fixtureEvents: Array<{
      event: MatrixEvent;
      message?: SyncFixtureMessage;
      reaction?: SyncFixtureReaction;
    }> = [
      ...(item.messages ?? []).map((message) => ({
        event: messageEvent(item.roomId, message),
        message,
      })),
      ...(item.reactions ?? []).map((reaction) => ({
        event: reactionEvent(item.roomId, reaction),
        reaction,
      })),
      ...(item.timelineStateEvents ?? []).map((stateItem) => {
        eventCounter += 1;
        return {
          event: new MatrixEvent({
            type: stateItem.type,
            state_key: stateItem.stateKey,
            sender: stateItem.sender,
            room_id: item.roomId,
            event_id: stateItem.eventId,
            origin_server_ts: stateItem.timestamp ?? 1_700_000_000_000 + eventCounter,
            content: stateItem.content,
            unsigned: stateItem.prevContent ? { prev_content: stateItem.prevContent } : {},
          }),
        };
      }),
    ];
    const newEvents: MatrixEvent[] = [];
    await fixtureEvents.reduce(async (previous, { event, message, reaction }) => {
      await previous;
      const eventId = event.getId();
      const existing = eventId ? room.findEventById(eventId) : undefined;
      if (existing) {
        if (message) {
          registerFixtureDecryption(message);
          if (
            message.decryptedContent !== undefined ||
            message.decryptedType !== undefined ||
            message.failureCode !== undefined ||
            message.failure !== undefined
          ) {
            await decryptKnownEvent(message.eventId);
          }
          if (
            message.redacted ||
            message.redactionReason !== undefined ||
            message.redactionEventId !== undefined
          ) {
            redactExistingEvent(
              room,
              message.eventId,
              message.redactionReason,
              message.redactionEventId
            );
          }
        }
        if (
          reaction &&
          (reaction.redacted ||
            reaction.redactionReason !== undefined ||
            reaction.redactionEventId !== undefined)
        ) {
          redactExistingEvent(
            room,
            reaction.eventId,
            reaction.redactionReason,
            reaction.redactionEventId
          );
        }
        return;
      }
      if (message) {
        registerFixtureDecryption(message);
        if (
          message.decryptedContent !== undefined ||
          message.decryptedType !== undefined ||
          message.failureCode !== undefined ||
          message.failure !== undefined
        ) {
          await event.attemptDecryption(fakeCrypto.crypto as never);
          client.emit(MatrixEventEvent.Decrypted, event);
        }
      }
      rememberEvent(event);
      newEvents.push(event);
    }, Promise.resolve());
    (item.history?.messages ?? []).forEach((message) => {
      const event = messageEvent(item.roomId, message);
      registerFixtureDecryption(message);
      rememberEvent(event);
      if (
        message.decryptedContent !== undefined ||
        message.decryptedType !== undefined ||
        message.failureCode !== undefined ||
        message.failure !== undefined
      ) {
        decryptKnownEvent(message.eventId).catch(() => undefined);
      }
    });
    if (item.typing?.length) {
      const typingEvent = new MatrixEvent({
        type: 'm.typing',
        room_id: item.roomId,
        content: { user_ids: [...item.typing] },
      });
      room.addEphemeralEvents([typingEvent]);
      item.typing.forEach((userId) => {
        const member = room.getMember(userId);
        if (member) client.emit(RoomMemberEvent.Typing, typingEvent, member);
      });
    }
    if (item.history) historyByRoom.set(item.roomId, item.history);
    if (item.unread) {
      room.setUnreadNotificationCount(NotificationCountType.Total, item.unread.total);
      room.setUnreadNotificationCount(NotificationCountType.Highlight, item.unread.highlight);
    }
    if (item.backwardToken !== undefined) {
      room.getLiveTimeline().setPaginationToken(item.backwardToken, EventTimeline.BACKWARDS);
    }
    if (item.eventOrder) {
      const order = new Map(item.eventOrder.map((eventId, index) => [eventId, index]));
      newEvents.sort(
        (a, b) =>
          (order.get(a.getId() ?? '') ?? item.eventOrder!.length) -
          (order.get(b.getId() ?? '') ?? item.eventOrder!.length)
      );
    }
    await newEvents.reduce(async (previous, event) => {
      await previous;
      await room.addLiveEvents([event], { addToState: false });
      client.emit(RoomEvent.Timeline, event, room, false, false, {
        timeline: room.getLiveTimeline(),
        liveEvent: true,
      });
    }, Promise.resolve());
    (item.redactions ?? []).forEach((redaction) => {
      redactExistingEvent(room, redaction.eventId, redaction.reason, redaction.redactionEventId);
    });
    (item.receipts ?? []).forEach((receipt) => {
      const receiptEvent = new MatrixEvent({
        type: 'm.receipt',
        room_id: room.roomId,
        content: {
          [receipt.eventId]: {
            [ReceiptType.Read]: {
              [receipt.userId]: { ts: Date.now() },
            },
          },
        },
      });
      room.addReceipt(receiptEvent, false);
    });
    if (item.receipts?.length) {
      client.emit(
        RoomEvent.Receipt,
        new MatrixEvent({ type: 'm.receipt', room_id: item.roomId, content: {} }),
        room
      );
    }
  };

  return {
    client,
    get cryptoCalls() {
      return [...cryptoCalls];
    },
    get importedKeysJson() {
      return cryptoState.importedKeysJson;
    },
    failNextOperation(operation, failure) {
      operationFailures.push({ operation, failure });
    },
    setRoomSummaryResponse(roomIdOrAlias, response) {
      roomSummaryResponses.set(roomIdOrAlias, response);
    },
    setThirdPartyProtocolsResponse(response) {
      thirdPartyProtocolsResponse = response;
    },
    setExportedRoomKeysJson(keysJson) {
      cryptoState.exportedRoomKeysJson = keysJson;
    },
    setKeyBackupInfo(info) {
      cryptoState.keyBackupInfo = info;
    },
    setActiveSessionBackupVersion(version) {
      cryptoState.activeSessionBackupVersion = version;
    },
    setKeyBackupTrust(trust) {
      cryptoState.keyBackupTrust = trust;
    },
    queueDecryption(eventId, clear, failureCode) {
      fakeCrypto.queueDecryption(eventId, clear, failureCode);
    },
    async decryptEvent(eventId) {
      return decryptKnownEvent(eventId);
    },
    getCalls() {
      return [...calls];
    },
    async applyFixture(fixture) {
      if (fixture.devices) devices = fixture.devices;
      if (fixture.threepids !== undefined) threepids = fixture.threepids;
      if (fixture.notifications !== undefined) notifications = fixture.notifications;
      await (fixture.rooms ?? []).reduce(async (previous, item) => {
        await previous;
        await applyRoom(item);
      }, Promise.resolve());
      publishDirectRooms();
      const overrideRules = fixture.rooms
        .filter((item) => item.notificationMode && item.notificationMode !== 'all')
        .map((item) => ({
          rule_id: item.roomId,
          enabled: true,
          actions: item.notificationMode === 'mute' ? [] : ['highlight'],
          conditions: [{ kind: 'event_match', key: 'room_id', pattern: item.roomId }],
        }));
      if (overrideRules.length > 0) {
        const event = new MatrixEvent({
          type: 'm.push_rules',
          content: { global: { override: overrideRules } },
        });
        client.store.storeAccountDataEvents([event]);
        client.emit(ClientEvent.AccountData, event);
      }
      (fixture.presence ?? []).forEach((item) => {
        const user = client.store.getUser(item.userId) ?? User.createUser(item.userId, client);
        const event = new MatrixEvent({
          type: 'm.presence',
          content: {
            presence: item.status,
            ...(item.displayName !== undefined ? { displayname: item.displayName } : {}),
            ...(item.avatarUrl !== undefined ? { avatar_url: item.avatarUrl } : {}),
            ...(item.statusMessage !== undefined ? { status_msg: item.statusMessage } : {}),
            ...(item.active !== undefined ? { currently_active: item.active } : {}),
            ...(item.lastActiveTs !== undefined
              ? { last_active_ago: Math.max(0, Date.now() - item.lastActiveTs) }
              : {}),
          },
        });
        // The SDK can emit user events before the new user reaches its store.
        user.setPresenceEvent(event);
        client.store.storeUser(user);
        client.emit(ClientEvent.Event, event);
      });
    },
  };
}
