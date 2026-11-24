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
  'm.relates_to'?: IEventRelation;
};

export type RoomPinnedEventsEventContent = ContentObject & {
  pinned: string[];
};

export type EventContent = IContent | RoomPinnedEventsEventContent;
