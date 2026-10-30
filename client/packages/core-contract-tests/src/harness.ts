import type { HarrierCore } from '@harrier/core';

export type SyncFixtureMessage = {
  readonly eventId: string;
  readonly sender: string;
  readonly body: string;
  readonly replaces?: string;
  readonly replyTo?: string;
  readonly redacted?: boolean;
};

export type SyncFixtureReaction = {
  readonly eventId: string;
  readonly target: string;
  readonly sender: string;
  readonly key: string;
};

export type SyncFixtureReceipt = {
  readonly eventId: string;
  readonly userId: string;
};

export type SyncFixtureRoom = {
  readonly roomId: string;
  readonly membership: 'join' | 'invite' | 'leave';
  readonly name?: string;
  readonly direct?: boolean;
  readonly space?: boolean;
  readonly children?: readonly string[];
  readonly messages?: readonly SyncFixtureMessage[];
  readonly reactions?: readonly SyncFixtureReaction[];
  readonly receipts?: readonly SyncFixtureReceipt[];
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
