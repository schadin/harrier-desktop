import { useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useCallback, useEffect } from 'react';
import {
  IRoomIdToTypingMembers,
  TypingReceipt,
  roomIdToTypingMembersAtom,
} from '../state/typingMembers';
import { useCore } from './useCore';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';

const typingReceiptEqual = (a: TypingReceipt, b: TypingReceipt): boolean =>
  a.userId === b.userId && a.ts === b.ts;

const equalTypingMembers = (x: TypingReceipt[], y: TypingReceipt[]): boolean => {
  if (x.length !== y.length) return false;
  return x.every((a, i) => typingReceiptEqual(a, y[i]));
};

export const useRoomTypingMember = (roomId: string) => {
  const core = useCore();
  const setTypingMembers = useSetAtom(roomIdToTypingMembersAtom);
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');

  useEffect(() => {
    if (hideActivity) return undefined;
    const store = core.presence.typing(roomId);
    let previous = store.getSnapshot().value;
    previous.forEach((userId) => {
      setTypingMembers({ type: 'PUT', roomId, userId, ts: Date.now() });
    });
    return store.subscribe(() => {
      const next = store.getSnapshot().value;
      next.forEach((userId) => {
        if (!previous.includes(userId)) {
          setTypingMembers({ type: 'PUT', roomId, userId, ts: Date.now() });
        }
      });
      previous.forEach((userId) => {
        if (!next.includes(userId)) {
          setTypingMembers({ type: 'DELETE', roomId, userId });
        }
      });
      previous = next;
    });
  }, [core, roomId, hideActivity, setTypingMembers]);

  const selector = useCallback(
    (roomToTyping: IRoomIdToTypingMembers) => roomToTyping.get(roomId) ?? [],
    [roomId]
  );

  const typing = useAtomValue(selectAtom(roomIdToTypingMembersAtom, selector, equalTypingMembers));
  return typing;
};
