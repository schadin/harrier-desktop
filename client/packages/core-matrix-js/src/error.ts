import { CoreError, type CoreErrorCode, type JsonObject, type JsonValue } from '@harrier/core';

type ErrorRecord = Record<string, unknown>;

const STATUS_CODES: Readonly<Record<number, CoreErrorCode>> = {
  400: 'invalid-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  429: 'rate-limited',
};

const isRecord = (value: unknown): value is ErrorRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPlainRecord = (value: unknown): value is ErrorRecord => {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPlainJson = (value: unknown, seen = new WeakSet<object>()): JsonValue | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'object' || value === null) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => toPlainJson(item, seen) ?? null);
    }
    if (!isPlainRecord(value)) return undefined;
    const result: JsonObject = {};
    Object.entries(value).forEach(([key, item]) => {
      const plain = toPlainJson(item, seen);
      if (plain !== undefined) result[key] = plain;
    });
    return result;
  } finally {
    seen.delete(value);
  }
};

const finiteStatus = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const nonNegativeDelay = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const retryAfterHeader = (headers: unknown): string | undefined => {
  if (!headers) return undefined;
  const { get } = headers as { get?: unknown };
  if (typeof get === 'function') {
    try {
      const value = get.call(headers, 'Retry-After');
      if (typeof value === 'string') return value;
    } catch {
      return undefined;
    }
  }
  if (!isRecord(headers)) return undefined;
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'retry-after');
  return typeof entry?.[1] === 'string' ? entry[1] : undefined;
};

const parseRetryAfterHeader = (value: string | undefined): number | undefined => {
  const header = value?.trim();
  if (!header) return undefined;
  if (/^\d+$/.test(header)) {
    const milliseconds = Number(header) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
};

const retryAfterOf = (record: ErrorRecord | undefined, data: JsonValue | undefined) => {
  const direct = nonNegativeDelay(record?.retryAfterMs);
  if (direct !== undefined) return direct;
  const getRetryAfterMs = record?.getRetryAfterMs;
  if (typeof getRetryAfterMs === 'function') {
    try {
      const delay = nonNegativeDelay(getRetryAfterMs.call(record));
      if (delay !== undefined) return delay;
    } catch {
      // Malformed SDK retry metadata must not mask the original failure.
    }
  }
  const header = parseRetryAfterHeader(retryAfterHeader(record?.httpHeaders));
  if (header !== undefined) return header;
  return isJsonObject(data) ? nonNegativeDelay(data.retry_after_ms) : undefined;
};

const errorCodeOf = (
  value: unknown,
  record: ErrorRecord | undefined,
  httpStatus: number | undefined,
  errcode: string | undefined
): CoreErrorCode => {
  if (errcode === 'M_LIMIT_EXCEEDED') return 'rate-limited';
  if (httpStatus !== undefined) return STATUS_CODES[httpStatus] ?? 'unknown';
  if (errcode === 'M_FORBIDDEN') return 'forbidden';
  if (errcode === 'M_NOT_FOUND') return 'not-found';
  if (value instanceof TypeError || record?.name === 'TypeError') return 'network';
  return 'unknown';
};

const errorDataOf = (
  plain: JsonValue | undefined,
  errcode: string | undefined,
  error: string | undefined
): JsonValue | undefined => {
  if (isJsonObject(plain)) {
    return errcode !== undefined && plain.errcode !== errcode ? { ...plain, errcode } : plain;
  }
  if (plain !== undefined) return plain;
  if (errcode === undefined && error === undefined) return undefined;
  return {
    ...(errcode !== undefined ? { errcode } : {}),
    ...(error !== undefined ? { error } : {}),
  };
};

export function normalizeMatrixError(value: unknown): CoreError {
  if (value instanceof CoreError) return value;
  const record = isRecord(value) ? value : undefined;
  const httpStatus = finiteStatus(record?.httpStatus ?? record?.status);
  const plainData = toPlainJson(record?.data);
  const dataRecord = isJsonObject(plainData) ? plainData : undefined;
  const errcode =
    (typeof record?.errcode === 'string' ? record.errcode : undefined) ??
    (typeof dataRecord?.errcode === 'string' ? dataRecord.errcode : undefined);
  const error =
    (typeof dataRecord?.error === 'string' ? dataRecord.error : undefined) ??
    (typeof record?.error === 'string' ? record.error : undefined);
  const data = errorDataOf(plainData, errcode, error);
  const message = error ?? (value instanceof Error ? value.message : String(value));
  const code = errorCodeOf(value, record, httpStatus, errcode);
  const retryable =
    code === 'network' ||
    code === 'rate-limited' ||
    httpStatus === 408 ||
    (httpStatus !== undefined && httpStatus >= 500);

  return new CoreError(
    code,
    message,
    retryable,
    httpStatus,
    errcode,
    data,
    retryAfterOf(record, data)
  );
}
