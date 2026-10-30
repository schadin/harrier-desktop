import { describe, expect, it } from 'vitest';
import { DecryptionFailureCode } from 'matrix-js-sdk/lib/crypto-api';
import {
  getDecryptionFailureActionLabelKey,
  getDecryptionFailureReason,
} from './decryptionFailure';

describe('getDecryptionFailureReason', () => {
  it('мапит MEGOLM_UNKNOWN_INBOUND_SESSION_ID в ожидание ключа + CTA «Запросить ключ»', () => {
    const reason = getDecryptionFailureReason(
      DecryptionFailureCode.MEGOLM_UNKNOWN_INBOUND_SESSION_ID
    );
    expect(reason.titleKey).toBe('DecryptionFailure.Reason.KeyNotReceived');
    expect(reason.action).toBe('requestKey');
    expect(getDecryptionFailureActionLabelKey(reason.action!)).toBe(
      'DecryptionFailure.Action.RequestKey'
    );
  });

  it('мапит MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE в CTA «Верифицировать устройство»', () => {
    const reason = getDecryptionFailureReason(
      DecryptionFailureCode.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE
    );
    expect(reason.titleKey).toBe('DecryptionFailure.Reason.KeyWithheldUnverifiedDevice');
    expect(reason.action).toBe('verifyDevice');
    expect(getDecryptionFailureActionLabelKey(reason.action!)).toBe(
      'DecryptionFailure.Action.VerifyDevice'
    );
  });

  it('мапит HISTORICAL_MESSAGE_NO_KEY_BACKUP / BACKUP_UNCONFIGURED в CTA «Бэкап»', () => {
    const noBackup = getDecryptionFailureReason(
      DecryptionFailureCode.HISTORICAL_MESSAGE_NO_KEY_BACKUP
    );
    const unconfigured = getDecryptionFailureReason(
      DecryptionFailureCode.HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED
    );
    expect(noBackup.action).toBe('restoreBackup');
    expect(unconfigured.action).toBe('restoreBackup');
    expect(getDecryptionFailureActionLabelKey(noBackup.action!)).toBe(
      'DecryptionFailure.Action.RestoreBackup'
    );
  });

  it('не даёт CTA для причин без эффективного действия', () => {
    const reason = getDecryptionFailureReason(
      DecryptionFailureCode.SENDER_IDENTITY_PREVIOUSLY_VERIFIED
    );
    expect(reason.action).toBeUndefined();
  });

  it('деградирует на общий текст для null / UNKNOWN_ERROR / undefined', () => {
    [null, DecryptionFailureCode.UNKNOWN_ERROR, undefined].forEach((code) => {
      expect(getDecryptionFailureReason(code).titleKey).toBe('DecryptionFailure.Reason.Unknown');
      expect(getDecryptionFailureReason(code).action).toBeUndefined();
    });
  });
});
