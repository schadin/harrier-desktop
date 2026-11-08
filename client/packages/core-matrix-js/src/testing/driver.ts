import {
  ClientEvent,
  createClient,
  EventStatus,
  EventTimeline,
  type IEvent,
  MatrixClient,
  MatrixEvent,
  ReceiptType,
  Room,
  NotificationCountType,
  RoomEvent,
  RoomMemberEvent,
  User,
  UserEvent,
} from 'matrix-js-sdk';

export const TEST_USER_ID = '@tester:example.org';
const DIRECT_PARTNER_ID = '@alice:example.org';

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
};

export type SyncFixtureRoom = {
  readonly roomId: string;
  readonly membership: 'join' | 'invite' | 'leave';
  readonly name?: string;
  readonly direct?: boolean;
  readonly space?: boolean;
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
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
  readonly presence?: readonly SyncFixturePresence[];
};

export type SyncDriver = {
  readonly client: MatrixClient;
  applyFixture(fixture: SyncFixture): Promise<void>;
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
    origin_server_ts: 1_700_000_000_000 + eventCounter,
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

export function createSyncDriver(): SyncDriver {
  const client = createClient({
    baseUrl: 'https://matrix.example.org',
    userId: TEST_USER_ID,
    accessToken: 'test-token',
    timelineSupport: true,
  });
  const directRooms = new Set<string>();
  const sendFailRooms = new Set<string>();
  const sendAttempts = new Map<string, number>();
  const knownEvents = new Map<string, Record<string, unknown>>();
  const historyByRoom = new Map<string, SyncFixtureRoom['history']>();

  client.http.authedRequest = (async (_method: string, path: string, params: { from?: string }) => {
    if (path.endsWith('/logout')) return {};
    if (path.includes('/join/')) {
      return { room_id: decodeURIComponent(path.split('/join/')[1]?.split('/')[0] ?? '') };
    }
    if (path.endsWith('/leave')) return {};
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
        start: params.from ?? 't0',
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
    const room = new Room(item.roomId, client, TEST_USER_ID, { timelineSupport: true });
    client.store.storeRoom(room);
    room.updateMyMembership(item.membership);
    const states: MatrixEvent[] = [];
    if (item.name !== undefined) {
      states.push(stateEvent(item.roomId, 'm.room.name', '', { name: item.name }));
    }
    if (item.space || item.roomVersion !== undefined || item.additionalCreators !== undefined) {
      states.push(
        stateEvent(item.roomId, 'm.room.create', '', {
          ...(item.space ? { type: 'm.space' } : {}),
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
    if (states.length > 0) room.currentState.setStateEvents(states);
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
    room.recalculate();
    client.emit(ClientEvent.Room, room);

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
          origin_server_ts: 1_700_000_000_000 + eventCounter,
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
    async applyFixture(fixture) {
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
        const user = new User(item.userId);
        const event = new MatrixEvent({
          type: 'm.presence',
          content: { presence: item.status },
        });
        user.setPresenceEvent(event);
        client.store.storeUser(user);
        client.emit(UserEvent.Presence, event, user);
      });
    },
  };
}
