import type { HarrierCore } from '@harrier/core';

export type SyncFixtureMessage = {
  readonly eventId: string;
  readonly sender: string;
  readonly body: string;
  readonly replaces?: string;
  readonly replyTo?: string;
  readonly redacted?: boolean;
  readonly status?: 'sending' | 'sent' | 'failed';
  readonly encrypted?: boolean;
  readonly failure?: 'missing-keys' | 'unknown-device' | 'unknown';
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
  readonly backwardToken?: string;
  readonly typing?: readonly string[];
  readonly unread?: { readonly total: number; readonly highlight: number };
  readonly notificationMode?: 'all' | 'mentions' | 'mute';
};

export type SyncFixturePresence = {
  readonly userId: string;
  readonly status: 'online' | 'offline' | 'unavailable';
};

export type SyncFixture = {
  readonly rooms: readonly SyncFixtureRoom[];
  readonly presence?: readonly SyncFixturePresence[];
};

export type CoreContractHarness = {
  readonly name: string;
  create(): Promise<HarrierCore>;
  applySyncFixture(fixture: SyncFixture): Promise<void>;
  dispose(core: HarrierCore): Promise<void>;
};
