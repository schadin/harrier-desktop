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

const MONTH_INDEX: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const IMF_FIXDATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const RFC850_DATE =
  /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/;
const ASCTIME_DATE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;

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
      if (plain === undefined) return;
      Object.defineProperty(result, key, {
        value: plain,
        enumerable: true,
        configurable: true,
        writable: true,
      });
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

const utcTimestamp = (
  year: number,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string
): number | undefined => {
  const monthIndex = MONTH_INDEX[month];
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    return undefined;
  }
  return date.getTime();
};

const rfc850Year = (twoDigitYear: number, now: number): number => {
  const currentYear = new Date(now).getUTCFullYear();
  let year = Math.floor(currentYear / 100) * 100 + twoDigitYear;
  if (year > currentYear + 50) year -= 100;
  return year;
};

const parseHttpDate = (value: string, now: number): number | undefined => {
  const imf = IMF_FIXDATE.exec(value);
  if (imf) {
    return utcTimestamp(Number(imf[3]), imf[2], imf[1], imf[4], imf[5], imf[6]);
  }
  const rfc850 = RFC850_DATE.exec(value);
  if (rfc850) {
    return utcTimestamp(
      rfc850Year(Number(rfc850[3]), now),
      rfc850[2],
      rfc850[1],
      rfc850[4],
      rfc850[5],
      rfc850[6]
    );
  }
  const asctime = ASCTIME_DATE.exec(value);
  if (asctime) {
    return utcTimestamp(
      Number(asctime[6]),
      asctime[1],
      asctime[2],
      asctime[3],
      asctime[4],
      asctime[5]
    );
  }
  return undefined;
};

const parseRetryAfterHeader = (value: string | undefined): number | undefined => {
  const header = value?.trim();
  if (!header) return undefined;
  if (/^\d+$/.test(header)) {
    const milliseconds = Number(header) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  const now = Date.now();
  const timestamp = parseHttpDate(header, now);
  return timestamp === undefined ? undefined : Math.max(0, timestamp - now);
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
