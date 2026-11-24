import type { LoginFlowView } from '@harrier/core';
import { useMemo } from 'react';

export const getSSOFlow = (loginFlows: readonly LoginFlowView[]): LoginFlowView | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.sso' || flow.type === 'm.login.cas');

export const getPasswordFlow = (loginFlows: readonly LoginFlowView[]): LoginFlowView | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.password');

export const getTokenFlow = (loginFlows: readonly LoginFlowView[]): LoginFlowView | undefined =>
  loginFlows.find((flow) => flow.type === 'm.login.token');

export type ParsedLoginFlows = {
  password?: LoginFlowView;
  token?: LoginFlowView;
  sso?: LoginFlowView;
};
export const useParsedLoginFlows = (loginFlows: readonly LoginFlowView[]) => {
  const parsedFlow: ParsedLoginFlows = useMemo<ParsedLoginFlows>(
    () => ({
      password: getPasswordFlow(loginFlows),
      token: getTokenFlow(loginFlows),
      sso: getSSOFlow(loginFlows),
    }),
    [loginFlows]
  );

  return parsedFlow;
};
