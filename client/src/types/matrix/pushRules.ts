export enum PushRuleActionName {
  DontNotify = 'dont_notify',
  Notify = 'notify',
  Coalesce = 'coalesce',
}

export enum TweakName {
  Highlight = 'highlight',
  Sound = 'sound',
}

type Tweak<N extends TweakName, V> = {
  set_tweak: N;
  value?: V;
};

type TweakHighlight = Tweak<TweakName.Highlight, boolean>;
type TweakSound = Tweak<TweakName.Sound, string>;
type Tweaks = TweakHighlight | TweakSound;

export type PushRuleAction = Tweaks | PushRuleActionName;

export enum ConditionOperator {
  ExactEquals = '==',
  LessThan = '<',
  GreaterThan = '>',
  GreaterThanOrEqual = '>=',
  LessThanOrEqual = '<=',
}

type MemberCountCondition<
  N extends number,
  Op extends ConditionOperator = ConditionOperator.ExactEquals
> = `${Op}${N}` | (Op extends ConditionOperator.ExactEquals ? `${N}` : never);

type AnyMemberCountCondition = MemberCountCondition<number, ConditionOperator>;

export enum ConditionKind {
  EventMatch = 'event_match',
  EventPropertyIs = 'event_property_is',
  EventPropertyContains = 'event_property_contains',
  ContainsDisplayName = 'contains_display_name',
  RoomMemberCount = 'room_member_count',
  SenderNotificationPermission = 'sender_notification_permission',
  CallStarted = 'call_started',
  CallStartedPrefix = 'org.matrix.msc3914.call_started',
}

export type IPushRuleCondition<N extends ConditionKind | string> = {
  [key: string]: unknown;
  kind: N;
};

export type PushRuleCondition =
  | (IPushRuleCondition<ConditionKind.EventMatch> & {
      key: string;
      pattern?: string;
      value?: string;
    })
  | (IPushRuleCondition<ConditionKind.EventPropertyIs> & {
      key: string;
      value: string | boolean | null | number;
    })
  | (IPushRuleCondition<ConditionKind.EventPropertyContains> & {
      key: string;
      value: string | boolean | null | number;
    })
  | IPushRuleCondition<ConditionKind.ContainsDisplayName>
  | (IPushRuleCondition<ConditionKind.RoomMemberCount> & {
      is: AnyMemberCountCondition;
    })
  | (IPushRuleCondition<ConditionKind.SenderNotificationPermission> & {
      key: string;
    })
  | IPushRuleCondition<ConditionKind.CallStarted>
  | IPushRuleCondition<ConditionKind.CallStartedPrefix>;

export enum PushRuleKind {
  Override = 'override',
  ContentSpecific = 'content',
  RoomSpecific = 'room',
  SenderSpecific = 'sender',
  Underride = 'underride',
}

export enum RuleId {
  Master = '.m.rule.master',
  IsUserMention = '.m.rule.is_user_mention',
  IsRoomMention = '.m.rule.is_room_mention',
  ContainsDisplayName = '.m.rule.contains_display_name',
  ContainsUserName = '.m.rule.contains_user_name',
  AtRoomNotification = '.m.rule.roomnotif',
  DM = '.m.rule.room_one_to_one',
  EncryptedDM = '.m.rule.encrypted_room_one_to_one',
  Message = '.m.rule.message',
  EncryptedMessage = '.m.rule.encrypted',
  InviteToSelf = '.m.rule.invite_for_me',
  MemberEvent = '.m.rule.member_event',
  IncomingCall = '.m.rule.call',
  SuppressNotices = '.m.rule.suppress_notices',
  Tombstone = '.m.rule.tombstone',
  PollStart = '.m.rule.poll_start',
  PollStartUnstable = '.org.matrix.msc3930.rule.poll_start',
  PollEnd = '.m.rule.poll_end',
  PollEndUnstable = '.org.matrix.msc3930.rule.poll_end',
  PollStartOneToOne = '.m.rule.poll_start_one_to_one',
  PollStartOneToOneUnstable = '.org.matrix.msc3930.rule.poll_start_one_to_one',
  PollEndOneToOne = '.m.rule.poll_end_one_to_one',
  PollEndOneToOneUnstable = '.org.matrix.msc3930.rule.poll_end_one_to_one',
}

export type IPushRule = {
  actions: PushRuleAction[];
  conditions?: PushRuleCondition[];
  default: boolean;
  enabled: boolean;
  pattern?: string;
  rule_id: RuleId | string;
};

export type PushRuleSet = Partial<Record<PushRuleKind, IPushRule[]>>;

export type IPushRules = {
  global: PushRuleSet;
  device?: PushRuleSet;
};

export type IPusherRequest = {
  app_display_name: string;
  app_id: string;
  data: {
    format?: string;
    url?: string;
    brand?: string;
  };
  device_display_name: string;
  kind: string;
  lang: string;
  profile_tag?: string;
  pushkey: string;
  enabled?: boolean | null;
  'org.matrix.msc3881.enabled'?: boolean | null;
  append?: boolean;
};
