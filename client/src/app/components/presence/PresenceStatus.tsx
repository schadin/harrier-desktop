import React from 'react';
import { Badge, Box, Text, Tooltip, TooltipProvider, MainColor } from 'folds';
import { Presence, usePresenceLabel } from '../../hooks/useUserPresence';
import type { UserPresence } from '../../hooks/useUserPresence';
import { getLastActiveLabel } from '../../utils/lastActive';

const PresenceToColor: Record<Presence, MainColor> = {
  [Presence.Online]: 'Success',
  [Presence.Unavailable]: 'Warning',
  [Presence.Offline]: 'Secondary',
};

type PresenceStatusProps = {
  presence: UserPresence;
};

export function PresenceStatus({ presence }: PresenceStatusProps) {
  const label = usePresenceLabel();
  const lastActiveLabel = getLastActiveLabel(presence.lastActiveTs);

  if (!lastActiveLabel) return null;

  return (
    <TooltipProvider
      position="Right"
      align="Center"
      offset={4}
      delay={200}
      tooltip={
        <Tooltip>
          <Text size="T200">{lastActiveLabel}</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Box ref={triggerRef} as="span" alignItems="Center" gap="100" style={{ cursor: 'pointer' }}>
          <Badge
            size="200"
            variant={PresenceToColor[presence.presence]}
            fill={presence.presence === Presence.Offline ? 'Soft' : 'Solid'}
            radii="Pill"
          />
          <Text size="T200" priority="300">
            {label[presence.presence]}
          </Text>
        </Box>
      )}
    </TooltipProvider>
  );
}
