import type { AuthDict } from '../../../types/matrix/uia';
import { AuthStageData } from '../../hooks/useUIAFlows';

export type StageComponentProps = {
  stageData: AuthStageData;
  submitAuthDict: (authDict: AuthDict) => void;
  onCancel: () => void;
};
