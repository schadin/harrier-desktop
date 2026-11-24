const MSG_TYPE = {
  Text: 'm.text',
  Emote: 'm.emote',
  Notice: 'm.notice',
  Image: 'm.image',
  File: 'm.file',
  Audio: 'm.audio',
  Location: 'm.location',
  Video: 'm.video',
  KeyVerificationRequest: 'm.key.verification.request',
} as const;

export type MsgType = typeof MSG_TYPE[keyof typeof MSG_TYPE];
export { MSG_TYPE as MsgType };

export type IEventRelation = {
  rel_type?: string;
  event_id?: string;
  is_falling_back?: boolean;
  'm.in_reply_to'?: {
    event_id?: string;
  };
  key?: string;
};

export type IMentions = {
  user_ids?: string[];
  room?: boolean;
};

export type RTCNotificationType = 'ring' | 'notification';

export type IRTCNotificationContent = {
  'm.relates_to': {
    event_id: string;
    rel_type: string;
  };
  'm.mentions'?: IMentions;
  notification_type: RTCNotificationType;
  'm.call.intent'?: string;
  sender_ts: number;
  lifetime: number;
};

type ContentObject = Record<string, unknown>;

export type IContent = ContentObject & {
  msgtype?: MsgType | string;
  body?: string;
  formatted_body?: string;
  format?: string;
  filename?: string;
  url?: string;
  info?: ContentObject;
  file?: ContentObject & {
    url?: string;
  };
  geo_uri?: string;
  membership?: string;
  reason?: string;
  'm.relates_to'?: IEventRelation;
};

export type RoomPinnedEventsEventContent = ContentObject & {
  pinned: string[];
};

export type RoomServerAclEventContent = ContentObject & {
  allow?: string[];
  allow_ip_literals?: boolean;
  deny?: string[];
};

export type MatrixRawEvent = {
  event_id: string;
  room_id?: string;
  sender: string;
  type: string;
  content: ContentObject;
  origin_server_ts?: number;
  state_key?: string;
};

export type MatrixRedactedEvent = Omit<MatrixRawEvent, 'content'> & {
  content: ContentObject & { reason?: string };
};

export type MatrixEventUnsigned = ContentObject & {
  prev_content?: ContentObject;
  redacted_because?: MatrixRedactedEvent;
};

export type IContextResponse = {
  end?: string;
  start?: string;
};

export type IMessagesResponse = {
  start?: string;
  end?: string;
  chunk: Array<MatrixRawEvent & { unsigned?: MatrixEventUnsigned }>;
};

export type CreateRoomOptions = {
  is_direct?: boolean;
  invite?: string[];
  visibility?: 'public' | 'private';
  preset?: 'private_chat' | 'trusted_private_chat' | 'public_chat';
  initial_state?: Array<{
    type: string;
    state_key?: string;
    content: ContentObject;
  }>;
};

export type EventContent = IContent | RoomPinnedEventsEventContent | RoomServerAclEventContent;
