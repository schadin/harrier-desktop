import { useEffect, useState } from 'react';
import { getRecentEmojis } from '../plugins/recent-emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { IEmoji } from '../plugins/emoji';
import { useCore } from './useCore';

export const useRecentEmoji = (limit?: number): IEmoji[] => {
  const core = useCore();
  const [recentEmoji, setRecentEmoji] = useState(() => getRecentEmojis(core, limit));

  useEffect(() => {
    const handleAccountData = (type: string) => {
      if (type !== AccountDataEvent.ElementRecentEmoji) return;
      setRecentEmoji(getRecentEmojis(core, limit));
    };

    return core.auth.onAccountData(handleAccountData);
  }, [core, limit]);

  return recentEmoji;
};
