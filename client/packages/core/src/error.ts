export type CoreErrorCode = 'unknown' | 'network' | 'unauthorized' | 'forbidden' | 'not-found';

export class CoreError extends Error {
  readonly code: CoreErrorCode;

  readonly retryable: boolean;

  constructor(code: CoreErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toCoreError(value: unknown): CoreError {
  if (value instanceof CoreError) return value;
  if (value instanceof Error) return new CoreError('unknown', value.message);
  return new CoreError('unknown', String(value));
}
