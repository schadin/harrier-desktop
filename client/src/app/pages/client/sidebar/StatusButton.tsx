import React, { MouseEventHandler, useCallback, useState } from 'react';
import { Box, color, config, Icon, Icons, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useCustomStatus } from '../../../hooks/useCustomStatus';
import {
  DEFAULT_STATUS_PRESETS,
  setCustomStatusWithTime,
  StatusPreset,
  stripTimeSuffix,
} from '../../../plugins/custom-status';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { stopPropagation } from '../../../utils/keyboard';

export function StatusButton() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const currentStatus = useCustomStatus(userId);
  const currentEmoji = currentStatus?.emoji ?? '';
  const currentText = currentStatus?.text ?? '';
  const hasStatus = !!currentEmoji;

  const [customPresets] = useSetting(settingsAtom, 'statusPresets');
  const [statusNoticeRoomId] = useSetting(settingsAtom, 'statusNoticeRoomId');
  const presets: StatusPreset[] = [...DEFAULT_STATUS_PRESETS, ...customPresets];

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const openMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };
  const closeMenu = useCallback(() => setMenuAnchor(undefined), []);

  const handleSelect = useCallback(
    (emoji: string, text: string) => {
      setCustomStatusWithTime(mx, emoji, text, statusNoticeRoomId);
      closeMenu();
    },
    [mx, closeMenu, statusNoticeRoomId]
  );

  const isActive = useCallback(
    (emoji: string, text: string) =>
      currentEmoji === emoji && stripTimeSuffix(currentText) === text,
    [currentEmoji, currentText]
  );

  return (
    <PopOut
      anchor={menuAnchor}
      position="Right"
      align="End"
      content={
        menuAnchor && (
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: closeMenu,
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu variant="Surface" style={{ padding: config.space.S200, width: 'max-content' }}>
              <Box direction="Column" gap="100">
                {presets.map((preset) => (
                  <MenuItem
                    key={`${preset.emoji}-${preset.text}`}
                    size="300"
                    radii="300"
                    onClick={() => handleSelect(preset.emoji, preset.text)}
                  >
                    <Box gap="200" grow="Yes" alignItems="Center">
                      <Text size="T400">{preset.emoji}</Text>
                      <Text as="span" size="T300" truncate>
                        {preset.text}
                      </Text>
                    </Box>
                    {isActive(preset.emoji, preset.text) && <Icon size="50" src={Icons.Check} />}
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        )
      }
    >
      <Box
        as="button"
        onClick={openMenu}
        aria-label="Change status"
        style={{
          position: 'absolute',
          bottom: -4,
          right: -4,
          width: 20,
          height: 20,
          borderRadius: '50%',
          padding: 0,
          border: `1px solid ${color.Background.Container}`,
          backgroundColor: color.SurfaceVariant.Container,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          lineHeight: 1,
          zIndex: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        {hasStatus ? (
          <Text size="T300">{currentEmoji}</Text>
        ) : (
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: color.Secondary.OnContainer,
              opacity: 0.4,
            }}
          />
        )}
      </Box>
    </PopOut>
  );
}
