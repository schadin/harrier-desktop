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
} from 'matrix-js-sdk';
import {
  ImportRoomKeyStage,
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type CryptoApi,
  type VerificationRequest,
} from 'matrix-js-sdk/lib/crypto-api';

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
  readonly reactions?: readonly SyncFixtureReaction[];
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

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
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

export type SyncDriver = {
  readonly client: MatrixClient;
  applyFixture(fixture: SyncFixture): Promise<void>;
  failNextOperation(operation: string, failure: SyncOperationFailure): void;
  setRoomSummaryResponse(roomIdOrAlias: string, response: unknown): void;
  setThirdPartyProtocolsResponse(response: unknown): void;
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

function redactionEvent(roomId: string, sender: string): IEvent {
  return {
    type: 'm.room.redaction',
    event_id: '$redaction',
    room_id: roomId,
    sender,
    origin_server_ts: 1_700_000_000_000,
    content: {},
  } as IEvent;
}

function messageEvent(roomId: string, message: SyncFixtureMessage): MatrixEvent {
  const content: Record<string, unknown> = {
    msgtype: message.encrypted ? 'm.bad.encrypted' : message.msgtype ?? 'm.text',
    body: message.body,
  };
  if (message.formattedBody !== undefined) {
    content.formatted_body = message.formattedBody;
    content.format = 'org.matrix.custom.html';
  }
  if (message.url !== undefined) content.url = message.url;
  if (message.filename !== undefined) content.filename = message.filename;
  if (message.info !== undefined) content.info = message.info;
  if (message.replaces !== undefined) {
    content['m.new_content'] = {
      msgtype: message.msgtype ?? 'm.text',
      body: message.body,
      ...(message.formattedBody !== undefined
        ? {
            formatted_body: message.formattedBody,
            format: 'org.matrix.custom.html',
          }
        : {}),
    };
    content['m.relates_to'] = { rel_type: 'm.replace', event_id: message.replaces };
  }
  if (message.replyTo !== undefined) {
    content['m.relates_to'] = { 'm.in_reply_to': { event_id: message.replyTo } };
  }
  if (message.threadRoot !== undefined) {
    content['m.relates_to'] = {
      rel_type: 'm.thread',
      event_id: message.threadRoot,
      'm.in_reply_to': { event_id: message.threadRoot },
    };
  }
  if (message.redacted) {
    Object.keys(content).forEach((key) => delete content[key]);
  }
  eventCounter += 1;
  const event = new MatrixEvent({
    type: message.encrypted ? 'm.room.encrypted' : 'm.room.message',
    sender: message.sender,
    room_id: roomId,
    event_id: message.eventId,
    origin_server_ts: message.timestamp ?? 1_700_000_000_000 + eventCounter,
    content,
    unsigned: message.redacted ? { redacted_because: redactionEvent(roomId, message.sender) } : {},
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
    content: {
      'm.relates_to': { rel_type: 'm.annotation', event_id: reaction.target, key: reaction.key },
      ...(reaction.shortcode !== undefined ? { shortcode: reaction.shortcode } : {}),
    },
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

const createFakeCrypto = (): CryptoApi =>
  ({
    getDeviceVerificationStatus: async () => ({ crossSigningVerified: false }),
    getOwnDeviceKeys: async () => ({ ed25519: 'ed25519-test-key' }),
    requestDeviceVerification: async () =>
      new FakeVerificationRequest() as unknown as VerificationRequest,
    getActiveSessionBackupVersion: async () => undefined,
    getKeyBackupInfo: async () => null,
    isKeyBackupTrusted: async () => ({ trusted: false, matchesDecryptionKey: false }),
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
  } as unknown as CryptoApi);

export function createSyncDriver(): SyncDriver {
  const client = createClient({
    baseUrl: 'https://matrix.example.org',
    userId: TEST_USER_ID,
    accessToken: 'test-token',
    timelineSupport: true,
  });
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
  client.getCrypto = () => createFakeCrypto();
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
  const operationFailures: Array<{ operation: string; failure: SyncOperationFailure }> = [];
  const failMatchingOperation = (path: string) => {
    const index = operationFailures.findIndex(({ operation }) => path.includes(operation));
    if (index < 0) return;
    const [{ failure }] = operationFailures.splice(index, 1);
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
    if (path.includes('/notifications')) return { notifications: [], next_token: 't1' };
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

    const events = [
      ...(item.messages ?? []).map((message) => messageEvent(item.roomId, message)),
      ...(item.reactions ?? []).map((reaction) => reactionEvent(item.roomId, reaction)),
      ...(item.timelineStateEvents ?? []).map((stateItem) => {
        eventCounter += 1;
        return new MatrixEvent({
          type: stateItem.type,
          state_key: stateItem.stateKey,
          sender: stateItem.sender,
          room_id: item.roomId,
          event_id: stateItem.eventId,
          origin_server_ts: stateItem.timestamp ?? 1_700_000_000_000 + eventCounter,
          content: stateItem.content,
          unsigned: stateItem.prevContent ? { prev_content: stateItem.prevContent } : {},
        });
      }),
    ];
    events.forEach((event) => {
      const eventId = event.getId();
      if (eventId) knownEvents.set(eventId, event.event);
    });
    (item.history?.messages ?? []).forEach((message) => {
      knownEvents.set(message.eventId, messageEvent(item.roomId, message).event);
    });
    (item.receipts ?? []).forEach((receipt) => {
      room.addReceiptToStructure(
        receipt.eventId,
        ReceiptType.Read,
        receipt.userId,
        { ts: 1 },
        false
      );
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
    room.getLiveTimeline().setPaginationToken(item.backwardToken ?? null, EventTimeline.BACKWARDS);
    if (item.receipts?.length) {
      client.emit(
        RoomEvent.Receipt,
        new MatrixEvent({ type: 'm.receipt', room_id: item.roomId, content: {} }),
        room
      );
    }
    await events.reduce(async (previous, event) => {
      await previous;
      await room.addLiveEvents([event], { addToState: false });
      client.emit(RoomEvent.Timeline, event, room, false, false, {
        timeline: room.getLiveTimeline(),
        liveEvent: true,
      });
    }, Promise.resolve());
  };

  return {
    client,
    failNextOperation(operation, failure) {
      operationFailures.push({ operation, failure });
    },
    setRoomSummaryResponse(roomIdOrAlias, response) {
      roomSummaryResponses.set(roomIdOrAlias, response);
    },
    setThirdPartyProtocolsResponse(response) {
      thirdPartyProtocolsResponse = response;
    },
    getCalls() {
      return [...calls];
    },
    async applyFixture(fixture) {
      if (fixture.devices) devices = fixture.devices;
      if (fixture.threepids !== undefined) threepids = fixture.threepids;
      await fixture.rooms.reduce(async (previous, item) => {
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
