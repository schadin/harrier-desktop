import { useCallback, useMemo } from 'react';
import type { CoreError } from '@harrier/core';
import type { AuthData, UIAFlow } from '../../types/matrix/uia';
import {
  getSupportedUIAFlows,
  getUIACompleted,
  getUIAError,
  getUIAErrorCode,
  getUIAParams,
  getUIASession,
} from '../utils/matrix-uia';

export const SUPPORTED_FLOW_TYPES = [
  'm.login.dummy',
  'm.login.password',
  'm.login.email.identity',
  'm.login.terms',
  'm.login.recaptcha',
  'm.login.registration_token',
] as const;

export const useSupportedUIAFlows = (uiaFlows: UIAFlow[], supportedStages: string[]): UIAFlow[] =>
  useMemo(() => getSupportedUIAFlows(uiaFlows, supportedStages), [uiaFlows, supportedStages]);

export const useUIACompleted = (authData: AuthData): string[] =>
  useMemo(() => getUIACompleted(authData), [authData]);

export const useUIAParams = (authData: AuthData) =>
  useMemo(() => getUIAParams(authData), [authData]);

export const useUIASession = (authData: AuthData) =>
  useMemo(() => getUIASession(authData), [authData]);

export const useUIAErrorCode = (authData: AuthData) =>
  useMemo(() => getUIAErrorCode(authData), [authData]);

export const useUIAError = (authData: AuthData) => useMemo(() => getUIAError(authData), [authData]);

export type StageInfo = Record<string, unknown>;
export type AuthStageData = {
  type: string;
  info?: StageInfo;
  session?: string;
  errorCode?: string;
  error?: string;
};
export type AuthStageDataGetter = () => AuthStageData | undefined;

export type UIAFlowInterface = {
  getStageToComplete: AuthStageDataGetter;
  hasStage: (stageType: string) => boolean;
  getStageInfo: (stageType: string) => StageInfo | undefined;
};
export const useUIAFlow = (authData: AuthData, uiaFlow: UIAFlow): UIAFlowInterface => {
  const completed = useUIACompleted(authData);
  const params = useUIAParams(authData);
  const session = useUIASession(authData);
  const errorCode = useUIAErrorCode(authData);
  const error = useUIAError(authData);

  const getStageToComplete: AuthStageDataGetter = useCallback(() => {
    const { stages } = uiaFlow;
    const nextStage = stages.find((stage) => !completed.includes(stage));
    if (!nextStage) return undefined;

    const info = params[nextStage];

    return {
      type: nextStage,
      info,
      session,
      errorCode,
      error,
    };
  }, [uiaFlow, completed, params, errorCode, error, session]);

  const hasStage = useCallback(
    (stageType: string): boolean => uiaFlow.stages.includes(stageType),
    [uiaFlow]
  );

  const getStageInfo = useCallback(
    (stageType: string): StageInfo | undefined => {
      if (!hasStage(stageType)) return undefined;

      return params[stageType];
    },
    [hasStage, params]
  );

  return {
    getStageToComplete,
    hasStage,
    getStageInfo,
  };
};

export const useUIAMatrixError = (
  error?: CoreError
): [undefined, undefined] | [AuthData, undefined] | [undefined, CoreError] => {
  if (!error) return [undefined, undefined];
  if (error.httpStatus === 401) return [error.data as AuthData, undefined];

  return [undefined, error];
};
