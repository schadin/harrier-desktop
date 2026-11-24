import type { HarrierCore } from '@harrier/core';
import { IEmoji, emojis } from './emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';

type EmojiUnicode = string;
type EmojiUsageCount = number;

export type IRecentEmojiContent = {
  recent_emoji?: [EmojiUnicode, EmojiUsageCount][];
};

export const getRecentEmojis = (core: HarrierCore, limit?: number): IEmoji[] => {
  const recentEmojiContent = core.auth
    .accountData(AccountDataEvent.ElementRecentEmoji)
    .getSnapshot().value as unknown as IRecentEmojiContent | null;
  const recentEmoji = recentEmojiContent?.recent_emoji;
  if (!Array.isArray(recentEmoji)) return [];

  return [...recentEmoji]
    .sort((e1, e2) => e2[1] - e1[1])
    .slice(0, limit)
    .reduce<IEmoji[]>((list, [unicode]) => {
      const emoji = emojis.find((e) => e.unicode === unicode);
      if (emoji) list.push(emoji);
      return list;
    }, []);
};

export async function addRecentEmoji(core: HarrierCore, unicode: string): Promise<void> {
  const recentEmojiContent = core.auth
    .accountData(AccountDataEvent.ElementRecentEmoji)
    .getSnapshot().value as unknown as IRecentEmojiContent | null;
  const recentEmoji =
    recentEmojiContent && Array.isArray(recentEmojiContent.recent_emoji)
      ? structuredClone(recentEmojiContent.recent_emoji)
      : [];

  const emojiIndex = recentEmoji.findIndex(([u]) => u === unicode);
  let entry: [EmojiUnicode, EmojiUsageCount];
  if (emojiIndex < 0) {
    entry = [unicode, 1];
  } else {
    [entry] = recentEmoji.splice(emojiIndex, 1);
    entry[1] += 1;
  }
  recentEmoji.unshift(entry);
  const result = await core.auth.setAccountData(AccountDataEvent.ElementRecentEmoji, {
    recent_emoji: recentEmoji.slice(0, 100),
  });
  if (!result.ok) throw result.error;
}
