import React, { ReactNode } from 'react';
import { useCoreEvent } from '../../../hooks/useCoreTimeline';

type EncryptedContentProps = {
  roomId: string;
  eventId: string;
  children: () => ReactNode;
};

export function EncryptedContent({ roomId, eventId, children }: EncryptedContentProps) {
  useCoreEvent(roomId, eventId);
  return <>{children()}</>;
}
