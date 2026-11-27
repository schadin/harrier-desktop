import type { HarrierCore, UserProfileView } from '@harrier/core';
import { getCoreDMRoomFor } from '../../../utils/coreRoomDirect';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { PaletteCategory, type PaletteItem } from './types';

export type PeoplePaletteNavigation = {
  navigateRoom(roomId: string): void;
  navigateDirectCreate(userId: string): void;
};

export const buildPeoplePaletteItems = (
  core: HarrierCore,
  users: readonly UserProfileView[],
  myUserId: string,
  dmPartnerIds: ReadonlySet<string>,
  navigation: PeoplePaletteNavigation
): PaletteItem[] =>
  users
    .filter(
      (user) => user.userId !== myUserId && (dmPartnerIds.has(user.userId) || !!user.displayName)
    )
    .map((user) => {
      const { userId } = user;
      const localPart = getMxIdLocalPart(userId) ?? userId;
      return {
        id: `user:${userId}`,
        category: PaletteCategory.People,
        title: user.displayName ?? localPart,
        subtitle: userId,
        keywords: [userId, localPart],
        dm: dmPartnerIds.has(userId),
        run: () => {
          const dmRoom = getCoreDMRoomFor(core, userId);
          if (dmRoom) {
            navigation.navigateRoom(dmRoom.roomId);
          } else {
            navigation.navigateDirectCreate(userId);
          }
        },
      };
    });
