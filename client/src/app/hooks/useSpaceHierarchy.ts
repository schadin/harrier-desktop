import { atom, useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HarrierCore, PublicRoomView, PublicRoomsResult } from '@harrier/core';
import { QueryFunction, useInfiniteQuery } from '@tanstack/react-query';
import type { MatrixErrorLike } from '../../types/matrix/legacyStructural';
import { useCore } from './useCore';
import type { GetCoreRoomCallback } from './useGetCoreRoom';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { MSpaceChildContent, StateEvent } from '../../types/matrix/room';
import { getAllParents } from '../utils/room';
import { isRoomId } from '../utils/matrix';
import { SortFunc, byOrderKey, byTsOldToNew } from '../utils/sort';
import { useStateEventCallback } from './useStateEventCallback';
import { ErrorCode } from '../cs-errorcode';

export type HierarchyItemSpace = {
  roomId: string;
  content: MSpaceChildContent;
  ts: number;
  space: true;
  parentId?: string;
};

export type HierarchyItemRoom = {
  roomId: string;
  content: MSpaceChildContent;
  ts: number;
  parentId: string;
};

export type HierarchyItem = HierarchyItemSpace | HierarchyItemRoom;

type HierarchyCore = Pick<HarrierCore, 'rooms'>;
type HierarchyChild = {
  roomId: string;
  content: MSpaceChildContent;
  ts: number;
};

const hierarchyItemTs: SortFunc<HierarchyItem> = (a, b) => byTsOldToNew(a.ts, b.ts);
const hierarchyItemByOrder: SortFunc<HierarchyItem> = (a, b) =>
  byOrderKey(a.content.order, b.content.order);

const getHierarchyChildren = (core: HierarchyCore, roomId: string): HierarchyChild[] => {
  const seen = new Set<string>();
  const children: HierarchyChild[] = [];

  core.rooms
    .stateList(roomId, StateEvent.SpaceChild)
    .getSnapshot()
    .value.forEach((entry) => {
      const childId = entry.stateKey;
      if (!childId || seen.has(childId) || !isRoomId(childId)) return;
      if (!Array.isArray(entry.content.via)) return;
      seen.add(childId);

      children.push({
        roomId: childId,
        content: {
          ...(entry.content as MSpaceChildContent),
          via: entry.content.via as string[],
          order: typeof entry.content.order === 'string' ? entry.content.order : undefined,
        },
        ts:
          typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
            ? entry.timestamp
            : 0,
      });
    });

  return children;
};

const getHierarchySpaces = (
  rootSpaceId: string,
  core: HierarchyCore,
  getRoom: GetCoreRoomCallback,
  spaceRooms: Set<string>
): HierarchyItemSpace[] => {
  const rootSpaceItem: HierarchyItemSpace = {
    roomId: rootSpaceId,
    content: { via: [] },
    ts: 0,
    space: true,
  };
  let spaceItems: HierarchyItemSpace[] = [];

  const findAndCollectHierarchySpaces = (spaceItem: HierarchyItemSpace) => {
    if (spaceItems.find((item) => item.roomId === spaceItem.roomId)) return;
    const space = getRoom(spaceItem.roomId);
    spaceItems.push(spaceItem);

    if (!space) return;
    getHierarchyChildren(core, spaceItem.roomId).forEach((child) => {
      // because we can not find if a childId is space without joining
      // or requesting room summary, we will look it into spaceRooms local
      // cache which we maintain as we load summary in UI.
      if (getRoom(child.roomId)?.isSpace || spaceRooms.has(child.roomId)) {
        findAndCollectHierarchySpaces({
          roomId: child.roomId,
          content: child.content,
          ts: child.ts,
          space: true,
          parentId: spaceItem.roomId,
        });
      }
    });
  };
  findAndCollectHierarchySpaces(rootSpaceItem);

  spaceItems = [
    rootSpaceItem,
    ...spaceItems
      .filter((item) => item.roomId !== rootSpaceId)
      .sort(hierarchyItemTs)
      .sort(hierarchyItemByOrder),
  ];

  return spaceItems;
};

export type SortRoomsCallback = (
  spaceId: string,
  items: HierarchyItemRoom[]
) => HierarchyItemRoom[];

export const sortRoomsByOrder = <T extends HierarchyItem>(items: T[]): T[] =>
  items.sort(hierarchyItemTs).sort(hierarchyItemByOrder);

export type SpaceHierarchy = {
  space: HierarchyItemSpace;
  rooms?: HierarchyItemRoom[];
};
export const getSpaceHierarchy = (
  rootSpaceId: string,
  spaceRooms: Set<string>,
  core: HierarchyCore,
  getRoom: GetCoreRoomCallback,
  closedCategory: (spaceId: string) => boolean,
  sortRooms: SortRoomsCallback
): SpaceHierarchy[] => {
  const spaceItems: HierarchyItemSpace[] = getHierarchySpaces(
    rootSpaceId,
    core,
    getRoom,
    spaceRooms
  );

  return spaceItems.map((spaceItem) => {
    const space = getRoom(spaceItem.roomId);
    if (!space || closedCategory(spaceItem.roomId)) {
      return { space: spaceItem };
    }
    const childItems: HierarchyItemRoom[] = getHierarchyChildren(core, spaceItem.roomId)
      .filter((child) => !getRoom(child.roomId)?.isSpace && !spaceRooms.has(child.roomId))
      .map((child) => ({ ...child, parentId: spaceItem.roomId }));

    return {
      space: spaceItem,
      rooms: sortRooms(spaceItem.roomId, childItems),
    };
  });
};

export const useSpaceHierarchy = (
  spaceId: string,
  spaceRooms: Set<string>,
  getRoom: GetCoreRoomCallback,
  closedCategory: (spaceId: string) => boolean,
  sortRooms: SortRoomsCallback
): SpaceHierarchy[] => {
  const core = useCore();
  const roomToParents = useAtomValue(roomToParentsAtom);

  const [hierarchyAtom] = useState(() =>
    atom(getSpaceHierarchy(spaceId, spaceRooms, core, getRoom, closedCategory, sortRooms))
  );
  const [hierarchy, setHierarchy] = useAtom(hierarchyAtom);

  useEffect(() => {
    setHierarchy(getSpaceHierarchy(spaceId, spaceRooms, core, getRoom, closedCategory, sortRooms));
  }, [core, spaceId, spaceRooms, setHierarchy, getRoom, closedCategory, sortRooms]);

  useStateEventCallback(
    useCallback(
      (entry) => {
        if (entry.eventType !== StateEvent.SpaceChild) return;
        const eventRoomId = entry.roomId;
        if (!eventRoomId) return;

        if (spaceId === eventRoomId || getAllParents(roomToParents, eventRoomId).has(spaceId)) {
          setHierarchy(
            getSpaceHierarchy(spaceId, spaceRooms, core, getRoom, closedCategory, sortRooms)
          );
        }
      },
      [spaceId, roomToParents, setHierarchy, spaceRooms, core, getRoom, closedCategory, sortRooms]
    )
  );

  return hierarchy;
};

export const getSpaceJoinedHierarchy = (
  rootSpaceId: string,
  core: HierarchyCore,
  getRoom: GetCoreRoomCallback,
  excludeRoom: (parentId: string, roomId: string) => boolean,
  sortRoomItems: (parentId: string, items: HierarchyItem[]) => HierarchyItem[]
): HierarchyItem[] => {
  const spaceItems: HierarchyItemSpace[] = getHierarchySpaces(
    rootSpaceId,
    core,
    getRoom,
    new Set()
  );

  return spaceItems.flatMap((spaceItem) => {
    const space = getRoom(spaceItem.roomId);
    if (!space) return [];
    const joinedChildren = getHierarchyChildren(core, spaceItem.roomId).filter((child) => {
      const room = getRoom(child.roomId);
      return !!room && !room.isSpace;
    });
    if (joinedChildren.length === 0) return [];

    const childItems: HierarchyItemRoom[] = joinedChildren
      .filter((child) => !excludeRoom(spaceItem.roomId, child.roomId))
      .map((child) => ({ ...child, parentId: spaceItem.roomId }));
    return [spaceItem, ...sortRoomItems(spaceItem.roomId, childItems)];
  });
};

export const useSpaceJoinedHierarchy = (
  spaceId: string,
  getRoom: GetCoreRoomCallback,
  excludeRoom: (parentId: string, roomId: string) => boolean,
  sortRoomItems: (parentId: string, items: HierarchyItem[]) => HierarchyItem[]
): HierarchyItem[] => {
  const core = useCore();
  const roomToParents = useAtomValue(roomToParentsAtom);

  const [hierarchyAtom] = useState(() =>
    atom(getSpaceJoinedHierarchy(spaceId, core, getRoom, excludeRoom, sortRoomItems))
  );
  const [hierarchy, setHierarchy] = useAtom(hierarchyAtom);

  useEffect(() => {
    setHierarchy(getSpaceJoinedHierarchy(spaceId, core, getRoom, excludeRoom, sortRoomItems));
  }, [core, spaceId, setHierarchy, getRoom, excludeRoom, sortRoomItems]);

  useStateEventCallback(
    useCallback(
      (entry) => {
        if (entry.eventType !== StateEvent.SpaceChild) return;
        const eventRoomId = entry.roomId;
        if (!eventRoomId) return;

        if (spaceId === eventRoomId || getAllParents(roomToParents, eventRoomId).has(spaceId)) {
          setHierarchy(getSpaceJoinedHierarchy(spaceId, core, getRoom, excludeRoom, sortRoomItems));
        }
      },
      [spaceId, roomToParents, setHierarchy, core, getRoom, excludeRoom, sortRoomItems]
    )
  );

  return hierarchy;
};

// we will paginate until 5000 items
const PER_PAGE_COUNT = 100;
const MAX_AUTO_PAGE_COUNT = 50;
export type FetchSpaceHierarchyLevelData = {
  fetching: boolean;
  error: Error | null;
  rooms: Map<string, PublicRoomView>;
};
export const useFetchSpaceHierarchyLevel = (
  roomId: string,
  enable: boolean
): FetchSpaceHierarchyLevelData => {
  const core = useCore();
  const pageNoRef = useRef(0);

  const fetchLevel: QueryFunction<PublicRoomsResult, string[], string | undefined> = useCallback(
    async ({ pageParam }) => {
      const result = await core.rooms.hierarchy(roomId, {
        limit: PER_PAGE_COUNT,
        maxDepth: 1,
        suggestedOnly: false,
        from: pageParam,
      });
      if (!result.ok) throw result.error;
      return result.value;
    },
    [roomId, core]
  );

  const queryResponse = useInfiniteQuery({
    refetchOnMount: enable,
    queryKey: [roomId, 'hierarchy_level'],
    initialPageParam: undefined,
    queryFn: fetchLevel,
    getNextPageParam: (result) => {
      if (result.nextBatch) return result.nextBatch;
      return undefined;
    },
    retry: 5,
    retryDelay: (failureCount, error) => {
      if ((error as MatrixErrorLike).errcode === ErrorCode.M_LIMIT_EXCEEDED) {
        const { retry_after_ms: delay } = (error as MatrixErrorLike).data;
        if (typeof delay === 'number') {
          return delay;
        }
      }

      return 500 * failureCount;
    },
  });

  const { data, isLoading, isFetchingNextPage, error, fetchNextPage, hasNextPage } = queryResponse;

  useEffect(() => {
    if (
      hasNextPage &&
      pageNoRef.current <= MAX_AUTO_PAGE_COUNT &&
      !error &&
      data &&
      data.pages.length > 0
    ) {
      pageNoRef.current += 1;
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, data, error]);

  const rooms: Map<string, PublicRoomView> = useMemo(() => {
    const roomsMap: Map<string, PublicRoomView> = new Map();
    if (!data) return roomsMap;

    const rms = data.pages.flatMap((result) => result.rooms);
    rms.forEach((r) => {
      roomsMap.set(r.roomId, r);
    });

    return roomsMap;
  }, [data]);

  const fetching = isLoading || isFetchingNextPage;

  return {
    fetching,
    error,
    rooms,
  };
};
