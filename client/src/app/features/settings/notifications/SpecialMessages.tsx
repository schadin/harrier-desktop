import React, { useCallback, useSyncExternalStore } from 'react';
import { Box, Text, Badge } from 'folds';
import {
  ConditionKind,
  IPushRules,
  PushRuleKind,
  RuleId,
} from '../../../../types/matrix/pushRules';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useCore } from '../../../hooks/useCore';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { getMxIdLocalPart } from '../../../utils/matrix';
import {
  makePushRuleData,
  PushRuleData,
  usePushRule,
  usePushRules,
} from '../../../hooks/usePushRule';
import {
  getNotificationModeActions,
  NotificationMode,
  NotificationModeOptions,
  useNotificationModeActions,
} from '../../../hooks/useNotificationMode';
import { NotificationModeSwitcher } from './NotificationModeSwitcher';

const NOTIFY_MODE_OPS: NotificationModeOptions = {
  highlight: true,
};
const getDefaultIsUserMention = (userId: string): PushRuleData =>
  makePushRuleData(
    PushRuleKind.Override,
    RuleId.IsUserMention,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    [
      {
        kind: ConditionKind.EventPropertyContains,
        key: 'content.m\\.mentions.user_ids',
        value: userId,
      },
    ]
  );

const DefaultContainsDisplayName = makePushRuleData(
  PushRuleKind.Override,
  RuleId.ContainsDisplayName,
  getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
  [
    {
      kind: ConditionKind.ContainsDisplayName,
    },
  ]
);

const getDefaultContainsUsername = (username: string) =>
  makePushRuleData(
    PushRuleKind.ContentSpecific,
    RuleId.ContainsUserName,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    undefined,
    username
  );

const DefaultIsRoomMention = makePushRuleData(
  PushRuleKind.Override,
  RuleId.IsRoomMention,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventPropertyIs,
      key: 'content.m\\.mentions.room',
      value: true,
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

const DefaultAtRoomNotification = makePushRuleData(
  PushRuleKind.Override,
  RuleId.AtRoomNotification,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventMatch,
      key: 'content.body',
      pattern: '@room',
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

type PushRulesProps = {
  ruleId: RuleId;
  pushRules: IPushRules;
  defaultPushRuleData: PushRuleData;
};
function MentionModeSwitcher({ ruleId, pushRules, defaultPushRuleData }: PushRulesProps) {
  const core = useCore();

  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions(NOTIFY_MODE_OPS);

  const handleChange = useCallback(
    async (mode: NotificationMode) => {
      const actions = getModeActions(mode);
      const result = await core.notifications.setPushRuleActions(kind, ruleId, actions);
      if (!result.ok) throw result.error;
    },
    [core, getModeActions, kind, ruleId]
  );

  return <NotificationModeSwitcher pushRule={pushRule} onChange={handleChange} />;
}

export function SpecialMessagesNotifications() {
  const core = useCore();
  const sessionStore = core.auth.session;
  const { value: session } = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot
  );
  const { userId } = session!;
  const { displayName } = useUserProfile(userId);
  const pushRules = usePushRules();

  return (
    <Box direction="Column" gap="100">
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Text size="L400">Special Messages</Text>
        <Box gap="100">
          <Text size="T200">Badge: </Text>
          <Badge radii="300" variant="Success" fill="Solid">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      </Box>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={`Mention User ID ("${userId}")`}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.IsUserMention}
              defaultPushRuleData={getDefaultIsUserMention(userId)}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={`Contains Displayname ${displayName ? `("${displayName}")` : ''}`}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsDisplayName}
              defaultPushRuleData={DefaultContainsDisplayName}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={`Contains Username ("${getMxIdLocalPart(userId)}")`}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsUserName}
              defaultPushRuleData={getDefaultContainsUsername(getMxIdLocalPart(userId) ?? userId)}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Mention @room"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.IsRoomMention}
              defaultPushRuleData={DefaultIsRoomMention}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Contains @room"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.AtRoomNotification}
              defaultPushRuleData={DefaultAtRoomNotification}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
