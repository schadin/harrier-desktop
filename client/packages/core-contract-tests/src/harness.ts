import type { HarrierCore } from '@harrier/core';

export type SyncFixtureRoom = {
  readonly roomId: string;
  readonly membership: 'join' | 'invite' | 'leave';
  readonly name?: string;
  readonly direct?: boolean;
  readonly space?: boolean;
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
};

export type CoreContractHarness = {
  readonly name: string;
  create(): Promise<HarrierCore>;
  applySyncFixture(fixture: SyncFixture): Promise<void>;
  dispose(core: HarrierCore): Promise<void>;
};
