import FocusTrap from 'focus-trap-react';
import React from 'react';
import { config, Menu, MenuItem, Text } from 'folds';
import { stopPropagation } from '../utils/keyboard';
import { RoomSortType } from '../../types/matrix/accountData';
import { useRoomSortMenu } from '../hooks/useRoomSort';

type RoomSortMenuProps = {
  requestClose: () => void;
  selected: RoomSortType;
  onSelect: (sortType: RoomSortType) => void;
};
export function RoomSortMenu({ selected, onSelect, requestClose }: RoomSortMenuProps) {
  const roomSortMenu = useRoomSortMenu();

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: requestClose,
        clickOutsideDeactivates: true,
        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
        escapeDeactivates: stopPropagation,
      }}
    >
      <Menu style={{ padding: config.space.S100 }}>
        {roomSortMenu.map((menuItem) => (
          <MenuItem
            key={menuItem.type}
            variant="Surface"
            aria-pressed={selected === menuItem.type}
            size="300"
            radii="300"
            onClick={() => {
              onSelect(menuItem.type);
              requestClose();
            }}
          >
            <Text size="T300">{menuItem.name}</Text>
          </MenuItem>
        ))}
      </Menu>
    </FocusTrap>
  );
}
