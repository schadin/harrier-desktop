import { Box, Button, color, config, Icon, Icons, Input, Spinner, Switch, Text } from 'folds';
import React, { FormEventHandler, useCallback, useState } from 'react';
import type { CoreError } from '@harrier/core';
import { useNavigate } from 'react-router-dom';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCard } from '../../components/sequence-card';
import { isUserId } from '../../utils/matrix';
import { useCore } from '../../hooks/useCore';
import { useCapabilities } from '../../hooks/useCapabilities';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { ErrorCode } from '../../cs-errorcode';
import { millisecondsToMinutes } from '../../utils/common';
import { useAlive } from '../../hooks/useAlive';
import { getDirectRoomPath } from '../../pages/pathUtils';
import { createPrivateRoomAndInvite, getCoreErrorData } from '../../utils/coreRoomActions';

type CreateChatProps = {
  defaultUserId?: string;
};
export function CreateChat({ defaultUserId }: CreateChatProps) {
  const core = useCore();
  const capabilities = useCapabilities();
  const roomVersion = capabilities['m.room_versions']?.default ?? '1';
  const alive = useAlive();
  const navigate = useNavigate();

  const [encryption, setEncryption] = useState(true);
  const [invalidUserId, setInvalidUserId] = useState(false);

  const [createState, create] = useAsyncCallback<string, CoreError, [string, boolean]>(
    useCallback(
      (userId, encrypted) =>
        createPrivateRoomAndInvite(core, { userId, encrypted, version: roomVersion }),
      [core, roomVersion]
    )
  );
  const loading = createState.status === AsyncStatus.Loading;
  const error = createState.status === AsyncStatus.Error ? createState.error : undefined;
  const retryAfterMs = getCoreErrorData(error)?.retry_after_ms;
  const disabled = createState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    setInvalidUserId(false);

    const target = evt.target as HTMLFormElement | undefined;
    const userIdInput = target?.userIdInput as HTMLInputElement | undefined;
    const userId = userIdInput?.value.trim();

    if (!userIdInput || !userId) return;
    if (!isUserId(userId)) {
      setInvalidUserId(true);
      return;
    }

    create(userId, encryption).then((roomId) => {
      if (alive()) {
        userIdInput.value = '';
        navigate(getDirectRoomPath(roomId));
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} grow="Yes" direction="Column" gap="500">
      <Box direction="Column" gap="100">
        <Text size="L400">User ID</Text>
        <Input
          defaultValue={defaultUserId}
          placeholder="@username:server"
          name="userIdInput"
          variant="SurfaceVariant"
          size="500"
          radii="400"
          required
          autoFocus
          autoComplete="off"
          disabled={disabled}
        />
        {invalidUserId && (
          <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
            <Icon src={Icons.Warning} filled size="50" />
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>Please enter a valid User ID.</b>
            </Text>
          </Box>
        )}
      </Box>
      <Box shrink="No" direction="Column" gap="100">
        <Text size="L400">Options</Text>
        <SequenceCard
          style={{ padding: config.space.S300 }}
          variant="SurfaceVariant"
          direction="Column"
          gap="500"
        >
          <SettingTile
            title="End-to-End Encryption"
            description="Once this feature is enabled, it can't be disabled after the room is created."
            after={
              <Switch
                variant="Primary"
                value={encryption}
                onChange={setEncryption}
                disabled={disabled}
              />
            }
          />
        </SequenceCard>
      </Box>
      {error && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="200">
          <Icon src={Icons.Warning} filled size="100" />
          <Text size="T300" style={{ color: color.Critical.Main }}>
            <b>
              {error.errcode === ErrorCode.M_LIMIT_EXCEEDED
                ? `Server rate-limited your request for ${millisecondsToMinutes(
                    typeof retryAfterMs === 'number' ? retryAfterMs : 0
                  )} minutes!`
                : error.message}
            </b>
          </Text>
        </Box>
      )}
      <Box shrink="No" direction="Column" gap="200">
        <Button
          type="submit"
          size="500"
          variant="Primary"
          radii="400"
          disabled={disabled}
          before={loading && <Spinner variant="Primary" fill="Solid" size="200" />}
        >
          <Text size="B500">Create</Text>
        </Button>
      </Box>
    </Box>
  );
}
