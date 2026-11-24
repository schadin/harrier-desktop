import React from 'react';
import { Icon, Icons, color } from 'folds';
import { useAtomValue } from 'jotai';
import type { SendStatus } from '@harrier/core';
import { useCoreSession } from '../../hooks/useCoreSession';
import { mDirectAtom } from '../../state/mDirectList';
import { settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';

export type MessageStatusProps = {
  roomId: string;
  sender: string;
  status: SendStatus;
  readBy?: readonly string[];
};

type MessageStatusIndicatorProps = {
  status: SendStatus;
  readBy?: readonly string[];
};

function MessageStatusIndicator({ status, readBy }: MessageStatusIndicatorProps) {
  if (status === 'failed') {
    return <Icon style={{ color: color.Critical.Main }} size="100" src={Icons.Cross} />;
  }

  if (status === 'sending') {
    return <Icon size="100" src={Icons.Clock} />;
  }

  if (readBy && readBy.length > 0) {
    return <Icon style={{ color: color.Primary.Main }} size="100" src={Icons.CheckTwice} />;
  }

  return <Icon size="100" src={Icons.Check} />;
}

export function MessageStatus({ roomId, sender, status, readBy }: MessageStatusProps) {
  const session = useCoreSession();
  const mDirects = useAtomValue(mDirectAtom);
  const [roomReadReceipts] = useSetting(settingsAtom, 'roomReadReceipts');
  const [directReadReceipts] = useSetting(settingsAtom, 'directReadReceipts');

  if (sender !== session?.userId) return null;

  if (status !== 'sent') return <MessageStatusIndicator status={status} readBy={readBy} />;

  const readReceiptsDisplay = mDirects.has(roomId) ? directReadReceipts : roomReadReceipts;
  if (readReceiptsDisplay !== 'checkmark') return null;

  return <MessageStatusIndicator status={status} readBy={readBy} />;
}
