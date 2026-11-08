import { useMemo, useRef } from 'react';
import type { HarrierCore } from '@harrier/core';
import { TYPING_TIMEOUT_MS } from '../state/typingMembers';

type TypingStatusUpdater = (typing: boolean) => void;

export const useTypingStatusUpdater = (core: HarrierCore, roomId: string): TypingStatusUpdater => {
  const statusSentTsRef = useRef<number>(0);

  const sendTypingStatus: TypingStatusUpdater = useMemo(() => {
    statusSentTsRef.current = 0;
    return (typing) => {
      if (typing) {
        if (Date.now() - statusSentTsRef.current < TYPING_TIMEOUT_MS) {
          return;
        }

        core.presence.setTyping(roomId, true, TYPING_TIMEOUT_MS).catch(() => undefined);
        const sentTs = Date.now();
        statusSentTsRef.current = sentTs;

        // Don't believe server will timeout typing status;
        // Clear typing status after timeout if already not;
        setTimeout(() => {
          if (statusSentTsRef.current === sentTs) {
            core.presence.setTyping(roomId, false, TYPING_TIMEOUT_MS).catch(() => undefined);
            statusSentTsRef.current = 0;
          }
        }, TYPING_TIMEOUT_MS);
        return;
      }

      if (Date.now() - statusSentTsRef.current < TYPING_TIMEOUT_MS) {
        core.presence.setTyping(roomId, false, TYPING_TIMEOUT_MS).catch(() => undefined);
      }
      statusSentTsRef.current = 0;
    };
  }, [core, roomId]);

  return sendTypingStatus;
};
