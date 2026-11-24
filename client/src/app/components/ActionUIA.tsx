import React, { ReactNode } from 'react';
import type { AuthData, AuthDict, UIAFlow } from '../../types/matrix/uia';
import { getUIAFlowForStages } from '../utils/matrix-uia';
import { useSupportedUIAFlows, useUIACompleted, useUIAFlow } from '../hooks/useUIAFlows';
import { UIAFlowOverlay } from './UIAFlowOverlay';
import { PasswordStage, SSOStage } from './uia-stages';
import { useMatrixClient } from '../hooks/useMatrixClient';

export const SUPPORTED_IN_APP_UIA_STAGES = ['m.login.password', 'm.login.sso'];

export const pickUIAFlow = (uiaFlows: UIAFlow[]): UIAFlow | undefined => {
  const passwordFlow = getUIAFlowForStages(uiaFlows, ['m.login.password']);
  if (passwordFlow) return passwordFlow;
  return getUIAFlowForStages(uiaFlows, ['m.login.sso']);
};

type ActionUIAProps = {
  authData: AuthData;
  ongoingFlow: UIAFlow;
  action: (authDict: AuthDict) => void;
  onCancel: () => void;
};
export function ActionUIA({ authData, ongoingFlow, action, onCancel }: ActionUIAProps) {
  const mx = useMatrixClient();
  const completed = useUIACompleted(authData);
  const { getStageToComplete } = useUIAFlow(authData, ongoingFlow);

  const stageToComplete = getStageToComplete();

  if (!stageToComplete) return null;
  return (
    <UIAFlowOverlay
      currentStep={completed.length + 1}
      stepCount={ongoingFlow.stages.length}
      onCancel={onCancel}
    >
      {stageToComplete.type === 'm.login.password' && (
        <PasswordStage
          userId={mx.getUserId()!}
          stageData={stageToComplete}
          onCancel={onCancel}
          submitAuthDict={action}
        />
      )}
      {stageToComplete.type === 'm.login.sso' && stageToComplete.session && (
        <SSOStage
          ssoRedirectURL={mx.getFallbackAuthUrl('m.login.sso', stageToComplete.session)}
          stageData={stageToComplete}
          onCancel={onCancel}
          submitAuthDict={action}
        />
      )}
    </UIAFlowOverlay>
  );
}

type ActionUIAFlowsLoaderProps = {
  authData: AuthData;
  unsupported: () => ReactNode;
  children: (ongoingFlow: UIAFlow) => ReactNode;
};
export function ActionUIAFlowsLoader({
  authData,
  unsupported,
  children,
}: ActionUIAFlowsLoaderProps) {
  const supportedFlows = useSupportedUIAFlows(authData.flows ?? [], SUPPORTED_IN_APP_UIA_STAGES);
  const ongoingFlow = supportedFlows.length > 0 ? supportedFlows[0] : undefined;

  if (!ongoingFlow) return unsupported();

  return children(ongoingFlow);
}
