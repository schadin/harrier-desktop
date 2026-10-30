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
};

export type SyncFixtureMessage = {
  readonly eventId: string;
  readonly sender: string;
  readonly body: string;
  readonly replaces?: string;
  readonly replyTo?: string;
  readonly redacted?: boolean;
  readonly status?: 'sending' | 'sent' | 'failed';
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
  readonly typing?: readonly string[];
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
  const content: Record<string, unknown> = { msgtype: 'm.text', body: message.body };
  if (message.replaces !== undefined) {
    content['m.new_content'] = { msgtype: 'm.text', body: message.body };
    content['m.relates_to'] = { rel_type: 'm.replace', event_id: message.replaces };
  }
  if (message.replyTo !== undefined) {
    content['m.relates_to'] = { 'm.in_reply_to': { event_id: message.replyTo } };
  }
  if (message.redacted) {
    Object.keys(content).forEach((key) => delete content[key]);
  }
  eventCounter += 1;
  const event = new MatrixEvent({
    type: 'm.room.message',
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
    },
  });
}

export function createSyncDriver(): SyncDriver {
  const client = createClient({
    baseUrl: 'https://matrix.example.org',
    userId: TEST_USER_ID,
    accessToken: 'test-token',
  });
  const directRooms = new Set<string>();

  const publishDirectRooms = () => {
    const event = new MatrixEvent({
      type: 'm.direct',
      content: { [DIRECT_PARTNER_ID]: [...directRooms] },
    });
    client.store.storeAccountDataEvents([event]);
    client.emit(ClientEvent.AccountData, event);
  };

  const applyRoom = async (item: SyncFixtureRoom) => {
    const room = new Room(item.roomId, client, TEST_USER_ID);
    client.store.storeRoom(room);
    room.updateMyMembership(item.membership);
    const states: MatrixEvent[] = [];
    if (item.name !== undefined) {
      states.push(stateEvent(item.roomId, 'm.room.name', '', { name: item.name }));
    }
    if (item.space) {
      states.push(stateEvent(item.roomId, 'm.room.create', '', { type: 'm.space' }));
    }
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
    if (item.direct) directRooms.add(item.roomId);
    room.recalculate();
    client.emit(ClientEvent.Room, room);

    const events = [
      ...(item.messages ?? []).map((message) => messageEvent(item.roomId, message)),
      ...(item.reactions ?? []).map((reaction) => reactionEvent(item.roomId, reaction)),
    ];
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
