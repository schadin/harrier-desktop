import { CoreError, createSnapshotStore, type HarrierCore, type JsonObject } from '@harrier/core';
import { describe, expect, it, vi } from 'vitest';
import { emojis } from './emoji';
import { addRecentEmoji, getRecentEmojis, type IRecentEmojiContent } from './recent-emoji';

const makeCore = (initial: JsonObject | null) => {
  const store = createSnapshotStore<JsonObject | null>(initial);
  const setAccountData = vi.fn(async (type: string, content: JsonObject) => {
    store.publish(content);
    return { ok: true as const, value: undefined };
  });
  const core = {
    auth: {
      accountData: () => store,
      setAccountData,
    },
  } as unknown as HarrierCore;
  return { core, store, setAccountData };
};

describe('recent emoji through core', () => {
  it('sorts known emoji by usage, applies the limit and leaves account data unchanged', () => {
    const first = emojis.find((emoji) => emoji.unicode === '🇦')!;
    const second = emojis.find((emoji) => emoji.unicode === '🇧')!;
    const content = {
      recent_emoji: [
        [first.unicode, 1],
        ['unknown', 0],
        [second.unicode, 5],
      ],
    };
    const { core, store } = makeCore(content);

    expect(getRecentEmojis(core, 2)).toEqual([second, first]);
    expect(store.getSnapshot().value).toEqual(content);
  });

  it('moves a newly used emoji to the front and persists it through core', async () => {
    const first = emojis.find((emoji) => emoji.unicode === '🇦')!;
    const second = emojis.find((emoji) => emoji.unicode === '🇧')!;
    const { core, store } = makeCore({ recent_emoji: [[first.unicode, 2]] });

    await addRecentEmoji(core, second.unicode);

    expect(store.getSnapshot().value).toEqual({
      recent_emoji: [
        [second.unicode, 1],
        [first.unicode, 2],
      ],
    });
  });

  it('increments an existing emoji instead of duplicating it', async () => {
    const first = emojis.find((emoji) => emoji.unicode === '🇦')!;
    const second = emojis.find((emoji) => emoji.unicode === '🇧')!;
    const { core, store } = makeCore({
      recent_emoji: [
        [second.unicode, 1],
        [first.unicode, 2],
      ],
    });

    await addRecentEmoji(core, first.unicode);

    expect(store.getSnapshot().value).toEqual({
      recent_emoji: [
        [first.unicode, 3],
        [second.unicode, 1],
      ],
    });
  });

  it('keeps only the 100 most recent entries', async () => {
    const recentEmoji: IRecentEmojiContent['recent_emoji'] = Array.from(
      { length: 100 },
      (_, index) => [`unknown-${index}`, 1] as [string, number]
    );
    const { core, store } = makeCore({ recent_emoji: recentEmoji });

    await addRecentEmoji(core, 'new-emoji');

    expect(store.getSnapshot().value).toEqual({
      recent_emoji: [['new-emoji', 1], ...recentEmoji.slice(0, 99)],
    });
  });

  it('rejects with the core error when account data cannot be written', async () => {
    const error = new CoreError('network', 'offline');
    const store = createSnapshotStore<JsonObject | null>(null);
    const core = {
      auth: {
        accountData: () => store,
        setAccountData: vi.fn(async () => ({ ok: false as const, error })),
      },
    } as unknown as HarrierCore;

    await expect(addRecentEmoji(core, emojis[0].unicode)).rejects.toBe(error);
  });
});
