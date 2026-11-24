import type { HarrierCore } from '@harrier/core';
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { Membership } from '../../types/matrix/room';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useCore } from './useCore';

export type ISidebarFolder = {
  name?: string;
  id: string;
  content: string[];
};
export type TSidebarItem = string | ISidebarFolder;
export type SidebarItems = Array<TSidebarItem>;

export type InCinnySpacesContent = {
  shortcut?: string[];
  sidebar?: SidebarItems;
};

const getCinnySpacesContent = (core: HarrierCore): InCinnySpacesContent | undefined =>
  (core.auth.accountData(AccountDataEvent.CinnySpaces).getSnapshot()
    .value as InCinnySpacesContent | null) ?? undefined;

export const parseSidebar = (
  core: HarrierCore,
  orphanSpaces: string[],
  content?: InCinnySpacesContent
) => {
  const sidebar = content?.sidebar ?? content?.shortcut ?? [];
  const orphans = new Set(orphanSpaces);

  const items: SidebarItems = [];

  const safeToAdd = (spaceId: string): boolean => {
    if (typeof spaceId !== 'string') return false;
    const space = core.rooms.room(spaceId).getSnapshot().value;
    if (space?.membership !== Membership.Join) return false;
    return space.isSpace;
  };

  sidebar.forEach((item) => {
    if (typeof item === 'string') {
      if (safeToAdd(item) && !items.includes(item)) {
        orphans.delete(item);
        items.push(item);
      }
      return;
    }
    if (
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      Array.isArray(item.content) &&
      !items.find((i) => (typeof i === 'string' ? false : i.id === item.id))
    ) {
      const safeContent = item.content.filter(safeToAdd);
      safeContent.forEach((i) => orphans.delete(i));
      items.push({
        ...item,
        content: Array.from(new Set(safeContent)),
      });
    }
  });

  orphans.forEach((spaceId) => items.push(spaceId));
  return items;
};

export const useSidebarItems = (
  orphanSpaces: string[]
): [SidebarItems, Dispatch<SetStateAction<SidebarItems>>] => {
  const core = useCore();

  const [sidebarItems, setSidebarItems] = useState(() => {
    const inCinnySpacesContent = getCinnySpacesContent(core);
    return parseSidebar(core, orphanSpaces, inCinnySpacesContent);
  });

  useEffect(() => {
    const inCinnySpacesContent = getCinnySpacesContent(core);
    setSidebarItems(parseSidebar(core, orphanSpaces, inCinnySpacesContent));
  }, [core, orphanSpaces]);

  useAccountDataCallback(
    useCallback(
      (type, content) => {
        if (type === AccountDataEvent.CinnySpaces) {
          const newContent = content as InCinnySpacesContent;
          setSidebarItems(parseSidebar(core, orphanSpaces, newContent));
        }
      },
      [core, orphanSpaces]
    )
  );

  return [sidebarItems, setSidebarItems];
};

export const sidebarItemWithout = (items: SidebarItems, roomId: string) => {
  const newItems: SidebarItems = items
    .map((item) => {
      if (typeof item === 'string') {
        if (item === roomId) return null;
        return item;
      }
      if (item.content.includes(roomId)) {
        const newContent = item.content.filter((id) => id !== roomId);
        if (newContent.length === 0) return null;
        return {
          ...item,
          content: newContent,
        };
      }
      return item;
    })
    .filter((item) => item !== null) as SidebarItems;

  return newItems;
};

export const makeCinnySpacesContent = (
  core: HarrierCore,
  items: SidebarItems
): InCinnySpacesContent => {
  const currentInSpaces = getCinnySpacesContent(core) ?? {};

  const newSpacesContent: InCinnySpacesContent = {
    ...currentInSpaces,
    sidebar: items,
  };

  return newSpacesContent;
};
