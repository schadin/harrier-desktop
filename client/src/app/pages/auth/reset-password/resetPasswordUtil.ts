import type { JsonObject } from '@harrier/core';
import { createAuthOperations } from '@harrier/core-matrix-js';

export type ResetPasswordResponse = Record<string, never>;
export type ResetPasswordResult = [JsonObject, undefined] | [undefined, ResetPasswordResponse];

const authOperations = createAuthOperations();

export const resetPassword = async (
  baseUrl: string,
  authDict: JsonObject,
  newPassword: string
): Promise<ResetPasswordResult> => {
  const result = await authOperations.setPassword(baseUrl, authDict, newPassword, false);
  if (!result.ok) throw result.error;
  if (result.value.auth) return [result.value.auth, undefined];
  return [undefined, (result.value.response ?? {}) as ResetPasswordResponse];
};
