import { DecryptionFailureCode } from 'matrix-js-sdk/lib/crypto-api';

export type DecryptionFailureActionId = 'requestKey' | 'verifyDevice' | 'restoreBackup';

export type DecryptionFailureReasonContent = {
  titleKey: string;
  action?: DecryptionFailureActionId;
};

const REASON_KEY_PREFIX = 'DecryptionFailure.Reason';

const key = (name: string) => `${REASON_KEY_PREFIX}.${name}`;

export const getDecryptionFailureReason = (
  code: DecryptionFailureCode | null | undefined
): DecryptionFailureReasonContent => {
  switch (code) {
    case DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID:
      return { titleKey: key('KeyNotReceived'), action: 'requestKey' };
    case DecryptionFailureCode.MEGOLM_KEY_WITHHELD:
      return { titleKey: key('KeyWithheld') };
    case DecryptionFailureCode.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE:
      return { titleKey: key('KeyWithheldUnverifiedDevice'), action: 'verifyDevice' };
    case DecryptionFailureCode.OLM_UNKNOWN_MESSAGE_INDEX:
      return { titleKey: key('UnknownMessageIndex') };
    case DecryptionFailureCode.HISTORICAL_MESSAGE_NO_KEY_BACKUP:
    case DecryptionFailureCode.HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED:
      return { titleKey: key('HistoricalNoBackup'), action: 'restoreBackup' };
    case DecryptionFailureCode.HISTORICAL_MESSAGE_WORKING_BACKUP:
      return { titleKey: key('HistoricalWorkingBackup') };
    case DecryptionFailureCode.HISTORICAL_MESSAGE_USER_NOT_JOINED:
      return { titleKey: key('HistoricalNotJoined') };
    case DecryptionFailureCode.SENDER_IDENTITY_PREVIOUSLY_VERIFIED:
      return { titleKey: key('SenderIdentityPreviouslyVerified') };
    case DecryptionFailureCode.UNSIGNED_SENDER_DEVICE:
      return { titleKey: key('UnsignedSenderDevice') };
    case DecryptionFailureCode.UNKNOWN_SENDER_DEVICE:
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
  code: DecryptionFailureCode | null | undefined
): boolean =>
  code === DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID ||
  code === DecryptionFailureCode.HISTORICAL_MESSAGE_WORKING_BACKUP;
