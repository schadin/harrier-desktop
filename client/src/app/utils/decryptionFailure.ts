export type DecryptionFailureCodeView =
  | 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID'
  | 'MEGOLM_KEY_WITHHELD'
  | 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE'
  | 'OLM_UNKNOWN_MESSAGE_INDEX'
  | 'HISTORICAL_MESSAGE_NO_KEY_BACKUP'
  | 'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED'
  | 'HISTORICAL_MESSAGE_WORKING_BACKUP'
  | 'HISTORICAL_MESSAGE_USER_NOT_JOINED'
  | 'SENDER_IDENTITY_PREVIOUSLY_VERIFIED'
  | 'UNSIGNED_SENDER_DEVICE'
  | 'UNKNOWN_SENDER_DEVICE';

export type DecryptionFailureActionId = 'requestKey' | 'verifyDevice' | 'restoreBackup';

export type DecryptionFailureReasonContent = {
  titleKey: string;
  action?: DecryptionFailureActionId;
};

const REASON_KEY_PREFIX = 'DecryptionFailure.Reason';

const key = (name: string) => `${REASON_KEY_PREFIX}.${name}`;

export const getDecryptionFailureReason = (
  code: DecryptionFailureCodeView | string | null | undefined
): DecryptionFailureReasonContent => {
  switch (code) {
    case 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID':
      return { titleKey: key('KeyNotReceived'), action: 'requestKey' };
    case 'MEGOLM_KEY_WITHHELD':
      return { titleKey: key('KeyWithheld') };
    case 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE':
      return { titleKey: key('KeyWithheldUnverifiedDevice'), action: 'verifyDevice' };
    case 'OLM_UNKNOWN_MESSAGE_INDEX':
      return { titleKey: key('UnknownMessageIndex') };
    case 'HISTORICAL_MESSAGE_NO_KEY_BACKUP':
    case 'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED':
      return { titleKey: key('HistoricalNoBackup'), action: 'restoreBackup' };
    case 'HISTORICAL_MESSAGE_WORKING_BACKUP':
      return { titleKey: key('HistoricalWorkingBackup') };
    case 'HISTORICAL_MESSAGE_USER_NOT_JOINED':
      return { titleKey: key('HistoricalNotJoined') };
    case 'SENDER_IDENTITY_PREVIOUSLY_VERIFIED':
      return { titleKey: key('SenderIdentityPreviouslyVerified') };
    case 'UNSIGNED_SENDER_DEVICE':
      return { titleKey: key('UnsignedSenderDevice') };
    case 'UNKNOWN_SENDER_DEVICE':
      return { titleKey: key('UnknownSenderDevice') };
    default:
      return { titleKey: key('Unknown') };
  }
};

export const getDecryptionFailureActionLabelKey = (action: DecryptionFailureActionId): string => {
  switch (action) {
    case 'requestKey':
      return 'DecryptionFailure.Action.RequestKey';
    case 'verifyDevice':
      return 'DecryptionFailure.Action.VerifyDevice';
    case 'restoreBackup':
      return 'DecryptionFailure.Action.RestoreBackup';
    default:
      return 'DecryptionFailure.Action.RestoreBackup';
  }
};

export const isRetryableDecryptionFailureReason = (
  code: DecryptionFailureCodeView | string | null | undefined
): boolean =>
  code === 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID' || code === 'HISTORICAL_MESSAGE_WORKING_BACKUP';
