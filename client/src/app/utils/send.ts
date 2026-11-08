import { getDefaultStore } from 'jotai';
import type { HarrierCore, JsonObject } from '@harrier/core';
import { sendErrorListAtom } from '../state/sendError';

let sendErrorId = 0;

const formatSendError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const notifySendError = (error: unknown): void => {
  const message = formatSendError(error);
  console.error('Message send failed:', error);
  sendErrorId += 1;
  getDefaultStore().set(sendErrorListAtom, (list) => [
    ...list.slice(-3),
    { id: sendErrorId, message: message.slice(0, 400) },
  ]);
};

export const sendMessageSafely = (core: HarrierCore, roomId: string, content: JsonObject): void => {
  core.send
    .sendMessage(roomId, content)
    .then((result) => {
      if (!result.ok) notifySendError(result.error);
    })
    .catch(notifySendError);
};

export const sendEventSafely = (
  core: HarrierCore,
  roomId: string,
  eventType: string,
  content: JsonObject
): void => {
  core.send
    .sendEvent(roomId, eventType, content)
    .then((result) => {
      if (!result.ok) notifySendError(result.error);
    })
    .catch(notifySendError);
};
