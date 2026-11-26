import React, { useCallback, useEffect } from 'react';
import { Box, Text, Chip } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useCore } from '../../../hooks/useCore';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { unwrapCoreResult } from '../../../utils/coreRoomActions';

export function ContactInformation() {
  const core = useCore();
  const [threePIdsState, loadThreePIds] = useAsyncCallback(
    useCallback(() => unwrapCoreResult(core.auth.threePids()), [core])
  );
  const threePIds = threePIdsState.status === AsyncStatus.Success ? threePIdsState.data : undefined;

  const emailIds = threePIds?.filter((id) => id.medium === 'email');

  useEffect(() => {
    loadThreePIds();
  }, [loadThreePIds]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Contact Information</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile title="Email Address" description="Email address attached to your account.">
          <Box>
            {emailIds?.map((email) => (
              <Chip key={email.address} as="span" variant="Secondary" radii="Pill">
                <Text size="T200">{email.address}</Text>
              </Chip>
            ))}
          </Box>
          {/* <Input defaultValue="" variant="Secondary" radii="300" /> */}
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}
