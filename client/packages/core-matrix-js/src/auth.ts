import {
  CoreError,
  type AuthOperations,
  type LoginFlowView,
  type ServerDiscoveryView,
} from '@harrier/core';
import { createClient, type SSOAction } from 'matrix-js-sdk';

const authError = (status: number | undefined, errcode: string | undefined): CoreError => {
  let code = 'Unknown';
  if (status === 400) code = 'InvalidRequest';
  else if (status === 429) code = 'RateLimited';
  else if (status === 403) code = 'Forbidden';
  else if (errcode === 'M_USER_DEACTIVATED') code = 'UserDeactivated';
  return new CoreError('unknown', code, false, status, code);
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
        const err = error as { httpStatus?: number; errcode?: string };
        return { ok: false, error: authError(err.httpStatus, err.errcode) };
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
        const err = error as { httpStatus?: number; errcode?: string };
        return { ok: false, error: authError(err.httpStatus, err.errcode) };
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
