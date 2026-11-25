import React from 'react';
import { Box, color, Spinner, Switch, Text } from 'folds';
import type { CoreError } from '@harrier/core';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../../room-settings/styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useRequiredCoreRoomFromContext } from '../../../hooks/useRoom';
import { useRoomDirectoryVisibility } from '../../../hooks/useRoomDirectoryVisibility';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { StateEvent } from '../../../../types/matrix/room';
import { useCoreSession } from '../../../hooks/useCoreSession';
import { useCoreRoomState } from '../../../hooks/useCoreRoomState';
import { ExtendedJoinRules, JoinRule } from '../../../components/JoinRulesSwitcher';
import type { RoomJoinRulesEventContent } from './RoomJoinRules';
import { RoomPermissionsAPI } from '../../../hooks/useRoomPermissions';

type RoomPublishProps = {
  permissions: RoomPermissionsAPI;
};
export function RoomPublish({ permissions }: RoomPublishProps) {
  const session = useCoreSession();
  const room = useRequiredCoreRoomFromContext();

  const canEditCanonical = permissions.stateEvent(
    StateEvent.RoomCanonicalAlias,
    session?.userId ?? ''
  );
  const content = useCoreRoomState<RoomJoinRulesEventContent>(room, StateEvent.RoomJoinRules);
  const rule: ExtendedJoinRules = (content?.join_rule as ExtendedJoinRules) ?? JoinRule.Invite;

  const { visibilityState, setVisibility } = useRoomDirectoryVisibility(room.roomId);

  const [toggleState, toggleVisibility] = useAsyncCallback(setVisibility);

  const loading =
    visibilityState.status === AsyncStatus.Loading || toggleState.status === AsyncStatus.Loading;
  const validRule =
    rule === JoinRule.Public || rule === JoinRule.Knock || rule === 'knock_restricted';

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Publish to Directory"
        description={
          room.isSpace
            ? 'List the space in the public directory to make it discoverable by others.'
            : 'List the room in the public directory to make it discoverable by others.'
        }
        after={
          <Box gap="200" alignItems="Center">
            {loading && <Spinner variant="Secondary" />}
            {!loading && visibilityState.status === AsyncStatus.Success && (
              <Switch
                value={visibilityState.data}
                onChange={toggleVisibility}
                disabled={!canEditCanonical || !validRule}
              />
            )}
          </Box>
        }
      >
        {visibilityState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(visibilityState.error as CoreError).message}
          </Text>
        )}

        {toggleState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(toggleState.error as CoreError).message}
          </Text>
        )}
      </SettingTile>
    </SequenceCard>
  );
}
