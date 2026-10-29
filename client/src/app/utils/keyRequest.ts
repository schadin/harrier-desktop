import { EventType, MatrixClient, MatrixEvent, SendToDeviceContentMap } from 'matrix-js-sdk';

const KEY_REQUEST_COOLDOWN_MS = 60_000;

const keyRequestSentAt = new Map<string, number>();

const makeRequestId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const requestRoomKey = async (mx: MatrixClient, mEvent: MatrixEvent): Promise<void> => {
  const eventId = mEvent.getId();
  if (!eventId) return;

  const lastSentAt = keyRequestSentAt.get(eventId);
  if (lastSentAt && Date.now() - lastSentAt < KEY_REQUEST_COOLDOWN_MS) {
    return;
  }

  const wireContent = mEvent.getWireContent();
  const { algorithm, room_id: roomId, sender_key: senderKey, session_id: sessionId } = wireContent;
  if (!roomId || !senderKey || !sessionId) return;

  const senderId = mEvent.getSender();
  if (!senderId) return;

  const recipients = mEvent.getKeyRequestRecipients(senderId);
  const requestId = makeRequestId();
  const body = { algorithm, room_id: roomId, sender_key: senderKey, session_id: sessionId };
  const contentMap = recipients.reduce<Record<string, Record<string, Record<string, unknown>>>>(
    (acc, recipient) => {
      const deviceMap = acc[recipient.userId] ?? {};
      deviceMap[recipient.deviceId] = { action: 'request', request_id: requestId, body };
      return { ...acc, [recipient.userId]: deviceMap };
    },
    {}
  );

  await mx.sendToDevice(EventType.RoomKeyRequest, contentMap as unknown as SendToDeviceContentMap);
  keyRequestSentAt.set(eventId, Date.now());
};
