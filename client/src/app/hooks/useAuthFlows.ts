import { createContext, useContext } from 'react';
import type { CoreError, JsonObject, LoginFlowsView } from '@harrier/core';

export enum RegisterFlowStatus {
  FlowRequired = 401,
  InvalidRequest = 400,
  RegistrationDisabled = 403,
  RateLimited = 429,
}

export type RegisterFlowsResponse =
  | {
      status: RegisterFlowStatus.FlowRequired;
      data: JsonObject;
    }
  | {
      status: Exclude<RegisterFlowStatus, RegisterFlowStatus.FlowRequired>;
    };

export const parseRegisterErrResp = (error: CoreError): RegisterFlowsResponse => {
  switch (error.httpStatus) {
    case RegisterFlowStatus.InvalidRequest:
      return { status: RegisterFlowStatus.InvalidRequest };
    case RegisterFlowStatus.RateLimited:
      return { status: RegisterFlowStatus.RateLimited };
    case RegisterFlowStatus.RegistrationDisabled:
      return { status: RegisterFlowStatus.RegistrationDisabled };
    case RegisterFlowStatus.FlowRequired:
      return { status: RegisterFlowStatus.FlowRequired, data: (error.data ?? {}) as JsonObject };
    default:
      return { status: RegisterFlowStatus.InvalidRequest };
  }
};

export type AuthFlows = {
  loginFlows: LoginFlowsView;
  registerFlows: RegisterFlowsResponse;
};

const AuthFlowsContext = createContext<AuthFlows | null>(null);

export const AuthFlowsProvider = AuthFlowsContext.Provider;

export const useAuthFlows = (): AuthFlows => {
  const authFlows = useContext(AuthFlowsContext);
  if (!authFlows) {
    throw new Error('Auth Flow info is not loaded!');
  }
  return authFlows;
};
