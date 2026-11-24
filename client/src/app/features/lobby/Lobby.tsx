import React, { MouseEventHandler, useCallback, useMemo, useRef, useState } from 'react';
import { Box, Chip, Icon, IconButton, Icons, Line, Scroll, Spinner, Text, config } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import type { HarrierCore, JsonObject, PublicRoomView } from '@harrier/core';
import produce from 'immer';
import { useSpace } from '../../hooks/useSpace';
import { Page, PageContent, PageContentCenter, PageHeroSection } from '../../components/page';
import {
  HierarchyItem,
  HierarchyItemRoom,
  HierarchyItemSpace,
  sortRoomsByOrder,
  useSpaceHierarchy,
} from '../../hooks/useSpaceHierarchy';
import { VirtualTile } from '../../components/virtualizer';
import { spaceRoomsAtom } from '../../state/spaceRooms';
import { MembersDrawer } from '../room/MembersDrawer';
import { useSetting } from '../../state/hooks/settings';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { settingsAtom } from '../../state/settings';
import { LobbyHeader } from './LobbyHeader';
import { LobbyHero } from './LobbyHero';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import {
  IPowerLevels,
  PowerLevelsContextProvider,
  usePowerLevels,
  useRoomsPowerLevels,
} from '../../hooks/usePowerLevels';
import { mDirectAtom } from '../../state/mDirectList';
import { makeLobbyCategoryId } from '../../state/closedLobbyCategories';
import { useCategoryHandler } from '../../hooks/useCategoryHandler';
import { useCore } from '../../hooks/useCore';
import { sendRoomState } from '../../hooks/useCoreRoomState';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { rateLimitedActions } from '../../utils/matrix';
import { getSpaceRoomPath } from '../../pages/pathUtils';
import { StateEvent } from '../../../types/matrix/room';
import { CanDropCallback, useDnDMonitor } from './DnD';
import { ASCIILexicalTable, orderKeys } from '../../utils/ASCIILexicalTable';
import { useClosedLobbyCategoriesAtom } from '../../state/hooks/closedLobbyCategories';
import {
  InCinnySpacesContent,
  sidebarItemWithout,
  useSidebarItems,
} from '../../hooks/useSidebarItems';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { SpaceHierarchy } from './SpaceHierarchy';
import { useGetRoom } from '../../hooks/useGetRoom';
import { useRoomSortComparator, useSpaceRoomSort } from '../../hooks/useRoomSort';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { getRoomPermissionsAPI } from '../../hooks/useRoomPermissions';
import { getRoomCreatorsForRoomId } from '../../hooks/useRoomCreators';

type RestrictedAllow = {
  type?: string;
  room_id?: string;
};

const getCanonicalAliasOrRoomId = (
  core: HarrierCore,
  roomId: string,
  roomIds: readonly string[]
): string => {
  const room = core.rooms.room(roomId).getSnapshot().value;
  if (!room) return roomId;
  if (core.rooms.stateEntry(roomId, StateEvent.RoomTombstone).getSnapshot().value) return roomId;
  if (!room.canonicalAlias) return roomId;

  const aliasedRoomId = roomIds.find((id) => {
    const candidate = core.rooms.room(id).getSnapshot().value;
    const tombstoned =
      core.rooms.stateEntry(id, StateEvent.RoomTombstone).getSnapshot().value !== null;
    return candidate?.canonicalAlias === room.canonicalAlias && !tombstoned;
  });
  return aliasedRoomId === roomId ? room.canonicalAlias : roomId;
};

const useCanDropLobbyItem = (
  space: { roomId: string },
  roomsPowerLevels: Map<string, IPowerLevels>,
  getRoom: (roomId: string) => unknown
): CanDropCallback => {
  const core = useCore();
  const userId = core.auth.session.getSnapshot().value?.userId ?? '';

  const canDropSpace: CanDropCallback = useCallback(
    (item, container) => {
      if (!('space' in container.item)) {
        // can not drop around rooms.
        // space can only be drop around other spaces
        return false;
      }

      const containerSpaceId = space.roomId;

      const powerLevels = roomsPowerLevels.get(containerSpaceId) ?? {};
      const creators = getRoomCreatorsForRoomId(core, containerSpaceId);
      const permissions = getRoomPermissionsAPI(creators, powerLevels);

      if (
        getRoom(containerSpaceId) === undefined ||
        !permissions.stateEvent(StateEvent.SpaceChild, userId)
      ) {
        return false;
      }

      return true;
    },
    [space, roomsPowerLevels, getRoom, userId, core]
  );

  const canDropRoom: CanDropCallback = useCallback(
    (item, container) => {
      const containerSpaceId =
        'space' in container.item ? container.item.roomId : container.item.parentId;

      const draggingOutsideSpace = item.parentId !== containerSpaceId;
      const restrictedItem =
        core.rooms.room(item.roomId).getSnapshot().value?.joinRule === 'restricted';

      // check and do not allow restricted room to be dragged outside
      // current space if can't change `m.room.join_rules` `content.allow`
      if (draggingOutsideSpace && restrictedItem) {
        const itemPowerLevels = roomsPowerLevels.get(item.roomId) ?? {};
        const itemCreators = getRoomCreatorsForRoomId(core, item.roomId);
        const itemPermissions = getRoomPermissionsAPI(itemCreators, itemPowerLevels);

        const canChangeJoinRuleAllow = itemPermissions.stateEvent(StateEvent.RoomJoinRules, userId);
        if (!canChangeJoinRuleAllow) {
          return false;
        }
      }

      const powerLevels = roomsPowerLevels.get(containerSpaceId) ?? {};
      const creators = getRoomCreatorsForRoomId(core, containerSpaceId);
      const permissions = getRoomPermissionsAPI(creators, powerLevels);
      if (
        getRoom(containerSpaceId) === undefined ||
        !permissions.stateEvent(StateEvent.SpaceChild, userId)
      ) {
        return false;
      }
      return true;
    },
    [userId, core, getRoom, roomsPowerLevels]
  );

  const canDrop: CanDropCallback = useCallback(
    (item, container): boolean => {
      if (item.roomId === container.item.roomId || item.roomId === container.nextRoomId) {
        // can not drop before or after itself
        return false;
      }

      // if we are dragging a space
      if ('space' in item) {
        return canDropSpace(item, container);
      }

      return canDropRoom(item, container);
    },
    [canDropSpace, canDropRoom]
  );

  return canDrop;
};

export function Lobby() {
  const navigate = useNavigate();
  const core = useCore();
  const userId = core.auth.session.getSnapshot().value?.userId ?? '';
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const space = useSpace();
  const spacePowerLevels = usePowerLevels(space);
  const lex = useMemo(() => new ASCIILexicalTable(' '.charCodeAt(0), '~'.charCodeAt(0), 6), []);
  const members = useRoomMembers(space.roomId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLDivElement>(null);
  const [heroSectionHeight, setHeroSectionHeight] = useState<number>();
  const [spaceRooms, setSpaceRooms] = useAtom(spaceRoomsAtom);
  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const screenSize = useScreenSizeContext();
  const [onTop, setOnTop] = useState(true);
  const [closedCategories, setClosedCategories] = useAtom(useClosedLobbyCategoriesAtom());
  const orphanSpaces = useMemo(
    () =>
      allRooms.filter((roomId) => {
        const room = core.rooms.room(roomId).getSnapshot().value;
        return room?.isSpace && core.rooms.parents(roomId).getSnapshot().value.length === 0;
      }),
    [core, allRooms]
  );
  const [sidebarItems] = useSidebarItems(orphanSpaces);
  const sidebarSpaces = useMemo(() => {
    const sideSpaces = sidebarItems.flatMap((item) => {
      if (typeof item === 'string') return item;
      return item.content;
    });

    return new Set(sideSpaces);
  }, [sidebarItems]);

  const [spacesItems, setSpacesItem] = useState<Map<string, PublicRoomView>>(() => new Map());

  useElementSizeObserver(
    useCallback(() => heroSectionRef.current, []),
    useCallback((w, height) => setHeroSectionHeight(height), [])
  );

  const getRoom = useGetRoom(allJoinedRooms);

  const sortComparator = useRoomSortComparator();
  const sortType = useSpaceRoomSort(space.roomId);
  const sortRooms = useCallback(
    (parentId: string, items: HierarchyItemRoom[]) => {
      const comparator = sortComparator(parentId);
      if (!comparator) return sortRoomsByOrder(items);
      items.sort((a, b) => comparator(a.roomId, b.roomId));
      return items;
    },
    [sortComparator]
  );

  const [draggingItem, setDraggingItem] = useState<HierarchyItem>();
  const hierarchy = useSpaceHierarchy(
    space.roomId,
    spaceRooms,
    getRoom,
    useCallback(
      (childId) =>
        closedCategories.has(makeLobbyCategoryId(space.roomId, childId)) ||
        (draggingItem ? 'space' in draggingItem : false),
      [closedCategories, space.roomId, draggingItem]
    ),
    sortRooms
  );

  const virtualizer = useVirtualizer({
    count: hierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 1,
    overscan: 2,
    paddingStart: heroSectionHeight ?? 258,
  });
  const vItems = virtualizer.getVirtualItems();

  const roomsPowerLevels = useRoomsPowerLevels(
    useMemo(
      () =>
        hierarchy
          .flatMap((i) => {
            const childRooms = Array.isArray(i.rooms) ? i.rooms.map((r) => getRoom(r.roomId)) : [];

            return [getRoom(i.space.roomId), ...childRooms];
          })
          .filter((r): r is NonNullable<typeof r> => !!r),
      [hierarchy, getRoom]
    )
  );

  const canDropBase: CanDropCallback = useCanDropLobbyItem(space, roomsPowerLevels, getRoom);
  const canDrop: CanDropCallback = useCallback(
    (item, container) => {
      if (!('space' in item) && sortType !== 'manual') {
        return false;
      }
      return canDropBase(item, container);
    },
    [canDropBase, sortType]
  );

  const [reorderSpaceState, reorderSpace] = useAsyncCallback(
    useCallback(
      async (item: HierarchyItemSpace, containerItem: HierarchyItem) => {
        if (!item.parentId) return;

        const itemSpaces: HierarchyItemSpace[] = hierarchy
          .map((i) => i.space)
          .filter((i) => i.roomId !== item.roomId);

        const beforeIndex = itemSpaces.findIndex((i) => i.roomId === containerItem.roomId);
        const insertIndex = beforeIndex + 1;

        itemSpaces.splice(insertIndex, 0, {
          ...item,
          content: { ...item.content, order: undefined },
        });

        const currentOrders = itemSpaces.map((i) => {
          if (typeof i.content.order === 'string' && lex.has(i.content.order)) {
            return i.content.order;
          }
          return undefined;
        });

        const newOrders = orderKeys(lex, currentOrders);

        const reorders = newOrders
          ?.map((orderKey, index) => ({
            item: itemSpaces[index],
            orderKey,
          }))
          .filter((reorder, index) => {
            if (!reorder.item.parentId) return false;
            const parentPL = roomsPowerLevels.get(reorder.item.parentId);
            if (!parentPL) return false;

            const creators = getRoomCreatorsForRoomId(core, reorder.item.parentId);
            const permissions = getRoomPermissionsAPI(creators, parentPL);
            const canEdit = permissions.stateEvent(StateEvent.SpaceChild, userId);
            return canEdit && reorder.orderKey !== currentOrders[index];
          });

        if (reorders) {
          await rateLimitedActions(reorders, async (reorder) => {
            if (!reorder.item.parentId) return;
            await sendRoomState(
              core,
              reorder.item.parentId,
              StateEvent.SpaceChild,
              { ...reorder.item.content, order: reorder.orderKey },
              reorder.item.roomId
            );
          });
        }
      },
      [core, userId, hierarchy, lex, roomsPowerLevels]
    )
  );
  const reorderingSpace = reorderSpaceState.status === AsyncStatus.Loading;

  const [reorderRoomState, reorderRoom] = useAsyncCallback(
    useCallback(
      async (item: HierarchyItem, containerItem: HierarchyItem) => {
        const itemRoom = core.rooms.room(item.roomId).getSnapshot().value;
        if (!item.parentId) {
          return;
        }
        const containerParentId: string =
          'space' in containerItem ? containerItem.roomId : containerItem.parentId;
        const itemContent = item.content;

        // remove from current space
        if (item.parentId !== containerParentId) {
          sendRoomState(core, item.parentId, StateEvent.SpaceChild, {}, item.roomId);
        }

        if (itemRoom && itemRoom.joinRule === 'restricted' && item.parentId !== containerParentId) {
          // change join rule allow parameter when dragging
          // restricted room from one space to another
          const { joinRuleContent } = itemRoom;

          if (joinRuleContent) {
            const currentAllow = Array.isArray(joinRuleContent.allow)
              ? (joinRuleContent.allow as RestrictedAllow[])
              : [];
            const allow = currentAllow.filter((allowRule) => allowRule.room_id !== item.parentId);
            allow.push({ type: 'm.room_membership', room_id: containerParentId });
            sendRoomState(core, itemRoom.roomId, StateEvent.RoomJoinRules, {
              ...joinRuleContent,
              allow,
            });
          }
        }

        const itemSpaces = Array.from(
          hierarchy?.find((i) => i.space.roomId === containerParentId)?.rooms ?? []
        );

        const beforeItem: HierarchyItem | undefined =
          'space' in containerItem ? undefined : containerItem;
        const beforeIndex = itemSpaces.findIndex((i) => i.roomId === beforeItem?.roomId);
        const insertIndex = beforeIndex + 1;

        itemSpaces.splice(insertIndex, 0, {
          ...item,
          parentId: containerParentId,
          content: { ...itemContent, order: undefined },
        });

        const currentOrders = itemSpaces.map((i) => {
          if (typeof i.content.order === 'string' && lex.has(i.content.order)) {
            return i.content.order;
          }
          return undefined;
        });

        const newOrders = orderKeys(lex, currentOrders);

        const reorders = newOrders
          ?.map((orderKey, index) => ({
            item: itemSpaces[index],
            orderKey,
          }))
          .filter((reorder, index) => reorder.item && reorder.orderKey !== currentOrders[index]);

        if (reorders) {
          await rateLimitedActions(reorders, async (reorder) => {
            await sendRoomState(
              core,
              containerParentId,
              StateEvent.SpaceChild,
              { ...reorder.item.content, order: reorder.orderKey },
              reorder.item.roomId
            );
          });
        }
      },
      [core, hierarchy, lex]
    )
  );
  const reorderingRoom = reorderRoomState.status === AsyncStatus.Loading;
  const reordering = reorderingRoom || reorderingSpace;

  useDnDMonitor(
    scrollRef,
    setDraggingItem,
    useCallback(
      (item, container) => {
        if (!canDrop(item, container)) {
          return;
        }
        if ('space' in item) {
          reorderSpace(item, container.item);
        } else {
          reorderRoom(item, container.item);
        }
      },
      [reorderRoom, reorderSpace, canDrop]
    )
  );

  const handleSpacesFound = useCallback(
    (sItems: PublicRoomView[]) => {
      setSpaceRooms({ type: 'PUT', roomIds: sItems.map((i) => i.roomId) });
      setSpacesItem((current) => {
        const newItems = produce(current, (draft) => {
          sItems.forEach((item) => draft.set(item.roomId, item));
        });
        return current.size === newItems.size ? current : newItems;
      });
    },
    [setSpaceRooms]
  );

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const handleOpenRoom: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const rId = evt.currentTarget.getAttribute('data-room-id');
    if (!rId) return;
    const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(core, space.roomId, allRooms);
    navigate(getSpaceRoomPath(pSpaceIdOrAlias, getCanonicalAliasOrRoomId(core, rId, allRooms)));
  };

  const togglePinToSidebar = useCallback(
    (rId: string) => {
      const newItems = sidebarItemWithout(sidebarItems, rId);
      if (!sidebarSpaces.has(rId)) {
        newItems.push(rId);
      }
      const currentContent = core.auth.accountData(AccountDataEvent.CinnySpaces).getSnapshot()
        .value as unknown as InCinnySpacesContent | null;
      const newSpacesContent: InCinnySpacesContent = {
        ...(currentContent ?? {}),
        sidebar: newItems,
      };
      core.auth.setAccountData(
        AccountDataEvent.CinnySpaces,
        newSpacesContent as unknown as JsonObject
      );
    },
    [core, sidebarItems, sidebarSpaces]
  );

  return (
    <PowerLevelsContextProvider value={spacePowerLevels}>
      <Box grow="Yes">
        <Page>
          <LobbyHeader
            showProfile={!onTop}
            powerLevels={roomsPowerLevels.get(space.roomId) ?? {}}
          />
          <Box style={{ position: 'relative' }} grow="Yes">
            <Scroll ref={scrollRef} hideTrack visibility="Hover">
              <PageContent>
                <PageContentCenter>
                  <ScrollTopContainer
                    scrollRef={scrollRef}
                    anchorRef={heroSectionRef}
                    onVisibilityChange={setOnTop}
                  >
                    <IconButton
                      onClick={() => virtualizer.scrollToOffset(0)}
                      variant="SurfaceVariant"
                      radii="Pill"
                      outlined
                      size="300"
                      aria-label="Scroll to Top"
                    >
                      <Icon src={Icons.ChevronTop} size="300" />
                    </IconButton>
                  </ScrollTopContainer>
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    <PageHeroSection ref={heroSectionRef} style={{ paddingTop: 0 }}>
                      <LobbyHero />
                    </PageHeroSection>
                    {vItems.map((vItem) => {
                      const item = hierarchy[vItem.index];
                      if (!item) return null;
                      const nextSpaceId = hierarchy[vItem.index + 1]?.space.roomId;

                      const categoryId = makeLobbyCategoryId(space.roomId, item.space.roomId);

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{
                            paddingTop: vItem.index === 0 ? 0 : config.space.S500,
                          }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <SpaceHierarchy
                            spaceItem={item.space}
                            summary={spacesItems.get(item.space.roomId)}
                            roomItems={item.rooms}
                            allJoinedRooms={allJoinedRooms}
                            mDirects={mDirects}
                            roomsPowerLevels={roomsPowerLevels}
                            categoryId={categoryId}
                            closed={
                              closedCategories.has(categoryId) ||
                              (draggingItem ? 'space' in draggingItem : false)
                            }
                            handleClose={handleCategoryClick}
                            draggingItem={draggingItem}
                            onDragging={setDraggingItem}
                            canDrop={canDrop}
                            disabledReorder={reordering}
                            disabledRoomReorder={sortType !== 'manual'}
                            nextSpaceId={nextSpaceId}
                            pinned={sidebarSpaces.has(item.space.roomId)}
                            togglePinToSidebar={togglePinToSidebar}
                            onSpacesFound={handleSpacesFound}
                            onOpenRoom={handleOpenRoom}
                          />
                        </VirtualTile>
                      );
                    })}
                  </div>
                  {reordering && (
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: config.space.S400,
                        left: 0,
                        right: 0,
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                      justifyContent="Center"
                    >
                      <Chip
                        variant="Secondary"
                        outlined
                        radii="Pill"
                        before={<Spinner variant="Secondary" fill="Soft" size="100" />}
                      >
                        <Text size="L400">Reordering</Text>
                      </Chip>
                    </Box>
                  )}
                </PageContentCenter>
              </PageContent>
            </Scroll>
          </Box>
        </Page>
        {screenSize === ScreenSize.Desktop && isDrawer && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <MembersDrawer room={space} members={members} />
          </>
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}
