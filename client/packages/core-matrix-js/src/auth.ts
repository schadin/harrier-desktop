import {
  CoreError,
  type AuthOperations,
  type LoginFlowView,
  type JsonObject,
  type ServerDiscoveryView,
} from '@harrier/core';
import { createClient, type SSOAction } from 'matrix-js-sdk';
import { normalizeMatrixError } from './error';

const authAlias = (status: number | undefined, errcode: string | undefined): string => {
  if (status === 400) return 'InvalidRequest';
  if (status === 429) return 'RateLimited';
  if (status === 403) return 'Forbidden';
  if (errcode === 'M_USER_DEACTIVATED') return 'UserDeactivated';
  return 'Unknown';
};

const registerFallbackAlias = (status: number | undefined): string => {
  if (status === 429) return 'RateLimited';
  if (status === 400) return 'InvalidRequest';
  if (status === 403) return 'Forbidden';
  return 'Unknown';
};

const withAuthAlias = (error: CoreError, alias: string): CoreError =>
  new CoreError(
    error.code,
    alias,
    error.retryable,
    error.httpStatus,
    alias,
    error.data,
    error.retryAfterMs
  );

const authError = (value: unknown): CoreError => {
  const error = normalizeMatrixError(value);
  return withAuthAlias(error, authAlias(error.httpStatus, error.errcode));
};

const dataErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback;
  const { error } = value as { error?: unknown };
  return typeof error === 'string' ? error : fallback;
};

export function createAuthOperations(): AuthOperations {
  return {
    async discover(server) {
      const host = /^https?:\/\//.test(server)
        ? server.replace(/\/$/, '')
        : `https://${server.replace(/\/$/, '')}`;
      try {
        const response = await fetch(`${host}/.well-known/matrix/client`, { method: 'GET' });
        if (response.status === 404) {
          return { ok: true, value: { 'm.homeserver': { base_url: host } } };
        }
        if (!response.ok) return { ok: false, error: new CoreError('network', 'Discovery failed') };
        const content = (await response.json()) as ServerDiscoveryView;
        if (typeof content['m.homeserver']?.base_url !== 'string') {
          return { ok: false, error: new CoreError('network', 'Invalid discovery response') };
        }
        return { ok: true, value: content };
      } catch (error) {
        return { ok: false, error: new CoreError('network', String(error)) };
      }
    },
    async login(baseUrl, request) {
      const mx = createClient({ baseUrl });
      try {
        const response = await mx.loginRequest(request as never);
        return {
          ok: true,
          value: {
            accessToken: response.access_token,
            deviceId: response.device_id,
            userId: response.user_id,
          },
        };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    async loginFlows(baseUrl) {
      const mx = createClient({ baseUrl });
      try {
        const response = await mx.loginFlows();
        const flows: LoginFlowView[] = response.flows.map((flow) => ({
          type: flow.type,
          ...('identity_providers' in flow && Array.isArray(flow.identity_providers)
            ? {
                identity_providers: flow.identity_providers.map((provider) => ({
                  ...(provider.id ? { id: provider.id } : {}),
                  ...(provider.name ? { name: provider.name } : {}),
                  ...(provider.icon ? { icon: provider.icon } : {}),
                  ...(provider.brand ? { brand: provider.brand } : {}),
                })),
              }
            : {}),
        }));
        return { ok: true, value: { flows } };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    async register(baseUrl, request) {
      const mx = createClient({ baseUrl });
      try {
        const response = await mx.registerRequest(request as never);
        return {
          ok: true,
          value: {
            response: {
              userId: response.user_id,
              ...(response.access_token ? { accessToken: response.access_token } : {}),
              ...(response.device_id ? { deviceId: response.device_id } : {}),
            },
          },
        };
      } catch (error) {
        const normalized = normalizeMatrixError(error);
        if (normalized.httpStatus === 401) {
          return { ok: true, value: { auth: (normalized.data ?? {}) as never } };
        }
        const registerCodes: Record<string, string> = {
          M_USER_IN_USE: 'UserTaken',
          M_INVALID_USERNAME: 'UserInvalid',
          M_EXCLUSIVE: 'UserExclusive',
          M_WEAK_PASSWORD: 'PasswordWeak',
          M_PASSWORD_TOO_SHORT: 'PasswordShort',
        };
        const rawErrcode = normalized.errcode;
        const alias =
          rawErrcode && Object.prototype.hasOwnProperty.call(registerCodes, rawErrcode)
            ? registerCodes[rawErrcode]
            : registerFallbackAlias(normalized.httpStatus);
        return {
          ok: false,
          error: new CoreError(
            normalized.code,
            dataErrorMessage(normalized.data, alias),
            normalized.retryable,
            normalized.httpStatus,
            alias,
            normalized.data,
            normalized.retryAfterMs
          ),
        };
      }
    },
    async requestEmailToken(baseUrl, email, clientSecret, sendAttempt, nextLink) {
      const mx = createClient({ baseUrl });
      try {
        const response = await mx.requestPasswordEmailToken(
          email,
          clientSecret,
          sendAttempt,
          nextLink
        );
        return {
          ok: true,
          value: {
            sid: response.sid,
            ...(response.submit_url ? { submitUrl: response.submit_url } : {}),
          },
        };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    async requestRegisterEmailToken(baseUrl, email, clientSecret, sendAttempt, nextLink) {
      const mx = createClient({ baseUrl });
      try {
        const response = await mx.requestRegisterEmailToken(
          email,
          clientSecret,
          sendAttempt,
          nextLink
        );
        return {
          ok: true,
          value: {
            sid: response.sid,
            ...(response.submit_url ? { submitUrl: response.submit_url } : {}),
          },
        };
      } catch (error) {
        return { ok: false, error: authError(error) };
      }
    },
    async setPassword(baseUrl, auth, newPassword, logoutDevices) {
      const mx = createClient({ baseUrl });
      try {
        await mx.setPassword(auth as never, newPassword, logoutDevices);
        return { ok: true, value: { response: {} } };
      } catch (error) {
        const normalized = normalizeMatrixError(error);
        if (normalized.httpStatus === 401) {
          return { ok: true, value: { auth: (normalized.data ?? {}) as JsonObject } };
        }
        return {
          ok: false,
          error: new CoreError(
            normalized.code,
            normalized.errcode ?? 'Unknown',
            normalized.retryable,
            normalized.httpStatus,
            normalized.errcode,
            normalized.data,
            normalized.retryAfterMs
          ),
        };
      }
    },
    ssoUrl(baseUrl, redirectUrl, idProviderId, action) {
      const mx = createClient({ baseUrl });
      return mx.getSsoLoginUrl(redirectUrl, 'sso', idProviderId, action as SSOAction | undefined);
    },
    mediaUrl(baseUrl, mxcUrl) {
      const mx = createClient({ baseUrl });
      return mx.mxcUrlToHttp(mxcUrl, 96, 96, 'crop', false);
    },
  };
}
