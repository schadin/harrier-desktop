import React, { MouseEventHandler, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, PopOut, RectCords, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { usePowerLevels } from '../../../hooks/usePowerLevels';
import { useRoom } from '../../../hooks/useRoom';
import {
  RoomProfile,
  RoomJoinRules,
  RoomLocalAddresses,
  RoomPublishedAddresses,
  RoomPublish,
  RoomUpgrade,
} from '../../common-settings/general';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../../room-settings/styles.css';
import { useRoomSortMenu, useSetSpaceRoomSort, useSpaceRoomSort } from '../../../hooks/useRoomSort';
import { RoomSortMenu } from '../../../components/RoomSortMenu';
import { RoomSortType } from '../../../../types/matrix/accountData';

function SelectRoomSort({ roomId }: { roomId: string }) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const sortType = useSpaceRoomSort(roomId);
  const setSpaceRoomSort = useSetSpaceRoomSort();
  const roomSortMenu = useRoomSortMenu();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (type: RoomSortType) => {
    setSpaceRoomSort(roomId, type);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">{roomSortMenu.find((i) => i.type === sortType)?.name ?? sortType}</Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <RoomSortMenu
            selected={sortType}
            onSelect={handleSelect}
            requestClose={() => setMenuCords(undefined)}
          />
        }
      />
    </>
  );
}

type GeneralProps = {
  requestClose: () => void;
};
export function General({ requestClose }: GeneralProps) {
  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              General
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <RoomProfile permissions={permissions} />
              <Box direction="Column" gap="100">
                <Text size="L400">Options</Text>
                <RoomJoinRules permissions={permissions} />
                <RoomPublish permissions={permissions} />
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Room Sorting</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                >
                  <SettingTile
                    title="Sorting"
                    description="Order of rooms in this space's sidebar and lobby."
                    after={<SelectRoomSort roomId={room.roomId} />}
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Addresses</Text>
                <RoomPublishedAddresses permissions={permissions} />
                <RoomLocalAddresses permissions={permissions} />
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Advanced Options</Text>
                <RoomUpgrade permissions={permissions} requestClose={requestClose} />
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
