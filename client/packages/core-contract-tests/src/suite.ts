import { describe, it } from 'vitest';
import type { CoreContractHarness } from './harness';

export type ContractCase = (harness: CoreContractHarness) => void;

export function runCoreContractSuite(harness: CoreContractHarness, cases: readonly ContractCase[]) {
  describe(`core contract: ${harness.name}`, () => {
    cases.forEach((run) => {
      run(harness);
    });
  });
}

export function contractTest(
  name: string,
  body: (harness: CoreContractHarness) => Promise<void>
): ContractCase {
  return (harness) => {
    it(name, () => body(harness));
  };
}
