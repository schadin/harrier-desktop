import {
  ClientEvent,
  EventStatus,
  EventTimeline,
  MatrixEvent,
  MatrixEventEvent,
  RoomEvent,
  RoomStateEvent,
  SyncState,
  type MatrixClient,
  type Room,
} from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createMatrixJsCore } from './core';
import { createSyncDriver } from './testing/driver';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const stateEvent = (roomId: string, eventId: string): MatrixEvent =>
  new MatrixEvent({
    type: 'm.room.name',
    state_key: '',
    sender: '@alice:example.org',
    room_id: roomId,
    event_id: eventId,
    origin_server_ts: 300,
    content: { name: 'New name' },
  });

const messageEvent = (roomId: string, eventId: string, body: string, timestamp: number) => {
  const event = new MatrixEvent({
    type: 'm.room.message',
    sender: '@alice:example.org',
    room_id: roomId,
    event_id: eventId,
    origin_server_ts: timestamp,
    content: { msgtype: 'm.text', body },
  });
  event.setStatus(EventStatus.SENT);
  return event;
};

const addTimelineEvent = (room: Room, event: MatrixEvent) => {
  room.getLiveTimeline().addEvent(event, { toStartOfTimeline: false, addToState: false });
};

const emitTimeline = (client: MatrixClient, room: Room, event: MatrixEvent) => {
  client.emit(RoomEvent.Timeline, event, room, false, false, {
    timeline: room.getLiveTimeline(),
    liveEvent: true,
  });
};

const queueStateEvent = (client: MatrixClient, room: Room, event: MatrixEvent) => {
  room.currentState.setStateEvents([event]);
  client.emit(RoomStateEvent.Events, event, room.currentState, null);
};

const setupRoom = async (
  core: Awaited<ReturnType<typeof createMatrixJsCore>>,
  driver: ReturnType<typeof createSyncDriver>,
  roomId: string,
  history = false
) => {
  await driver.applyFixture({
    rooms: [
      {
        roomId,
        membership: 'join',
        name: 'Old name',
        messages: [
          { eventId: '$initial', sender: '@alice:example.org', body: 'initial', timestamp: 100 },
        ],
        ...(history
          ? {
              backwardToken: 'history-token',
              history: {
                messages: [
                  {
                    eventId: '$older',
                    sender: '@alice:example.org',
                    body: 'older',
                    timestamp: 50,
                  },
                ],
              },
            }
          : {}),
      },
    ],
  });
  const room = driver.client.getRoom(roomId)!;
  const display = core.timeline.timeline(roomId);
  const live = core.timeline.liveTimeline(roomId);
  return { room, display, live };
};

describe('timeline lifecycle epoch publication policy', () => {
  it.each(['stop', 'logout'] as const)(
    'does not publish focus or clearFocus after %s',
    async (lifecycle) => {
      const driver = createSyncDriver();
      const core = createMatrixJsCore(driver.client);
      const roomId = `!focus-${lifecycle}:example.org`;
      try {
        const { room, display, live } = await setupRoom(core, driver, roomId);
        await core.timeline.focusEvent(roomId, '$initial');
        addTimelineEvent(room, messageEvent(roomId, '$late', 'late', 200));
        const displayBefore = display.getSnapshot();
        const liveBefore = live.getSnapshot();
        if (lifecycle === 'stop') await core.auth.stop();
        else await core.auth.logout();

        await core.timeline.focusEvent(roomId, '$initial');
        core.timeline.clearFocus(roomId);

        expect(display.getSnapshot()).toBe(displayBefore);
        expect(live.getSnapshot()).toBe(liveBefore);
      } finally {
        await core.auth.stop();
      }
    }
  );

  it.each(['stop', 'logout'] as const)(
    'does not publish pagination after %s',
    async (lifecycle) => {
      const driver = createSyncDriver();
      const core = createMatrixJsCore(driver.client);
      const roomId = `!pagination-${lifecycle}:example.org`;
      try {
        const { room, display, live } = await setupRoom(core, driver, roomId, true);
        room.getLiveTimeline().setPaginationToken('forward-token', EventTimeline.FORWARDS);
        addTimelineEvent(room, messageEvent(roomId, '$late', 'late', 200));
        const displayBefore = display.getSnapshot();
        const liveBefore = live.getSnapshot();
        if (lifecycle === 'stop') await core.auth.stop();
        else await core.auth.logout();

        await core.timeline.paginateBackward(roomId, 10);
        await core.timeline.paginateForward(roomId, 10);

        expect(display.getSnapshot()).toBe(displayBefore);
        expect(live.getSnapshot()).toBe(liveBefore);
      } finally {
        await core.auth.stop();
      }
    }
  );

  it('does not publish an in-flight backward page after stop and restart', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!stale-backward:example.org';
    try {
      const { display, live } = await setupRoom(core, driver, roomId, true);
      const displayBefore = display.getSnapshot();
      const liveBefore = live.getSnapshot();
      const gate = deferred();
      const paginate = driver.client.paginateEventTimeline.bind(driver.client);
      const paginateSpy = vi
        .spyOn(driver.client, 'paginateEventTimeline')
        .mockImplementation(async (...args) => {
          await gate.promise;
          return paginate(...args);
        });
      const pending = core.timeline.paginateBackward(roomId, 10);
      await vi.waitFor(() => expect(paginateSpy).toHaveBeenCalledTimes(1));
      await core.auth.stop();
      driver.client.startClient = async () => undefined;
      expect((await core.auth.start()).ok).toBe(true);
      gate.resolve();
      expect((await pending).ok).toBe(true);
      expect(display.getSnapshot()).toBe(displayBefore);
      expect(live.getSnapshot()).toBe(liveBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('does not publish an in-flight forward page after stop and restart', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!stale-forward:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      room.getLiveTimeline().setPaginationToken('forward-token', EventTimeline.FORWARDS);
      const displayBefore = display.getSnapshot();
      const liveBefore = live.getSnapshot();
      const gate = deferred();
      const paginateSpy = vi
        .spyOn(driver.client, 'paginateEventTimeline')
        .mockImplementation(async () => {
          await gate.promise;
          addTimelineEvent(room, messageEvent(roomId, '$late-page', 'late page', 200));
          return true;
        });
      const pending = core.timeline.paginateForward(roomId, 10);
      await vi.waitFor(() => expect(paginateSpy).toHaveBeenCalledTimes(1));
      await core.auth.stop();
      driver.client.startClient = async () => undefined;
      expect((await core.auth.start()).ok).toBe(true);
      gate.resolve();
      expect((await pending).ok).toBe(true);
      expect(display.getSnapshot()).toBe(displayBefore);
      expect(live.getSnapshot()).toBe(liveBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('rejects a focus whose initial timeline resolve crosses stop and restart', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!stale-focus-resolve:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      const displayBefore = display.getSnapshot();
      const liveBefore = live.getSnapshot();
      const gate = deferred();
      const timelineSpy = vi
        .spyOn(driver.client, 'getEventTimeline')
        .mockImplementation(async () => {
          await gate.promise;
          return room.getLiveTimeline();
        });
      const pending = core.timeline.focusEvent(roomId, '$initial');
      await vi.waitFor(() => expect(timelineSpy).toHaveBeenCalledTimes(1));
      await core.auth.stop();
      driver.client.startClient = async () => undefined;
      expect((await core.auth.start()).ok).toBe(true);
      addTimelineEvent(room, messageEvent(roomId, '$late', 'late', 200));
      gate.resolve();
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(Error);
      expect(display.getSnapshot()).toBe(displayBefore);
      expect(live.getSnapshot()).toBe(liveBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('stops focus pagination immediately when its await crosses stop and restart', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!stale-focus-page:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      room.getLiveTimeline().setPaginationToken('history-token', EventTimeline.BACKWARDS);
      const displayBefore = display.getSnapshot();
      const liveBefore = live.getSnapshot();
      const gate = deferred();
      vi.spyOn(driver.client, 'getEventTimeline').mockResolvedValue(room.getLiveTimeline());
      const paginateSpy = vi
        .spyOn(driver.client, 'paginateEventTimeline')
        .mockImplementation(async () => {
          addTimelineEvent(room, messageEvent(roomId, '$target', 'target', 200));
          await gate.promise;
          return true;
        });
      const pending = core.timeline.focusEvent(roomId, '$target');
      await vi.waitFor(() => expect(paginateSpy).toHaveBeenCalledTimes(1));
      await core.auth.stop();
      driver.client.startClient = async () => undefined;
      expect((await core.auth.start()).ok).toBe(true);
      gate.resolve();
      expect((await pending).ok).toBe(false);
      expect(paginateSpy).toHaveBeenCalledTimes(1);
      expect(display.getSnapshot()).toBe(displayBefore);
      expect(live.getSnapshot()).toBe(liveBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('keeps timeline progress during a transient sync error', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!error-epoch:example.org';
    try {
      const { display, live } = await setupRoom(core, driver, roomId, true);
      const roomsBefore = core.rooms.all.getSnapshot();
      const gate = deferred();
      const paginate = driver.client.paginateEventTimeline.bind(driver.client);
      vi.spyOn(driver.client, 'paginateEventTimeline').mockImplementation(async (...args) => {
        await gate.promise;
        return paginate(...args);
      });
      const pending = core.timeline.paginateBackward(roomId, 10);
      await Promise.resolve();
      driver.client.emit(ClientEvent.Sync, SyncState.Error, SyncState.Syncing);
      gate.resolve();
      expect((await pending).ok).toBe(true);
      expect(display.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
        '$older',
        '$initial',
      ]);
      expect(live.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
        '$older',
        '$initial',
      ]);
      expect(core.rooms.all.getSnapshot()).toBe(roomsBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('does not publish live after a display listener stops the lifecycle', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!reentrant-stop-live:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      const liveBefore = live.getSnapshot();
      let stopped = false;
      const unsubscribe = display.subscribe(() => {
        if (stopped) return;
        stopped = true;
        core.auth.stop().catch(() => undefined);
      });
      try {
        const late = messageEvent(roomId, '$late', 'late', 200);
        addTimelineEvent(room, late);
        emitTimeline(driver.client, room, late);
        expect(stopped).toBe(true);
        expect(display.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
          '$initial',
          '$late',
        ]);
        expect(live.getSnapshot()).toBe(liveBefore);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('does not publish live in a new session after a display listener stops and starts', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!reentrant-restart-live:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      const liveBefore = live.getSnapshot();
      driver.client.startClient = async () => undefined;
      let restarted = false;
      const unsubscribe = display.subscribe(() => {
        if (restarted) return;
        restarted = true;
        core.auth.stop().catch(() => undefined);
        core.auth.start().catch(() => undefined);
      });
      try {
        const late = messageEvent(roomId, '$late', 'late', 200);
        addTimelineEvent(room, late);
        emitTimeline(driver.client, room, late);
        expect(restarted).toBe(true);
        expect(live.getSnapshot()).toBe(liveBefore);
      } finally {
        unsubscribe();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('does not flush a second deferred room after the first listener restarts the lifecycle', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomAId = '!deferred-a:example.org';
    const roomBId = '!deferred-b:example.org';
    try {
      const a = await setupRoom(core, driver, roomAId);
      const b = await setupRoom(core, driver, roomBId);
      const lateA = messageEvent(roomAId, '$late-a', 'late A', 200);
      const lateB = messageEvent(roomBId, '$late-b', 'late B', 200);
      addTimelineEvent(a.room, lateA);
      addTimelineEvent(b.room, lateB);
      queueStateEvent(driver.client, a.room, stateEvent(roomAId, '$name-a'));
      queueStateEvent(driver.client, b.room, stateEvent(roomBId, '$name-b'));
      const bDisplayBefore = b.display.getSnapshot();
      const bLiveBefore = b.live.getSnapshot();
      driver.client.startClient = async () => undefined;
      let restarted = false;
      const unsubscribe = a.display.subscribe(() => {
        if (restarted) return;
        restarted = true;
        core.auth.stop().catch(() => undefined);
        core.auth.start().catch(() => undefined);
      });
      const recalculate = a.room.recalculate.bind(a.room);
      let injected = false;
      const recalculateSpy = vi.spyOn(a.room, 'recalculate').mockImplementation(() => {
        recalculate();
        if (injected) return;
        injected = true;
        emitTimeline(driver.client, a.room, lateA);
        emitTimeline(driver.client, b.room, lateB);
      });
      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);
        expect(restarted).toBe(true);
        expect(a.display.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
          '$initial',
          '$late-a',
        ]);
        expect(b.display.getSnapshot()).toBe(bDisplayBefore);
        expect(b.live.getSnapshot()).toBe(bLiveBefore);
      } finally {
        unsubscribe();
        recalculateSpy.mockRestore();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('defers clearFocus during suppression and publishes once after the batch', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!deferred-clear-focus:example.org';
    try {
      const { room, display, live } = await setupRoom(core, driver, roomId);
      await core.timeline.focusEvent(roomId, '$initial');
      addTimelineEvent(room, messageEvent(roomId, '$late', 'late', 200));
      queueStateEvent(driver.client, room, stateEvent(roomId, '$name-change'));
      let suppressing = false;
      let publishedDuringSuppression = false;
      const publications: Array<string | undefined> = [];
      const unsubscribe = display.subscribe(() => {
        if (suppressing) publishedDuringSuppression = true;
        publications.push(display.getSnapshot().value.focusedEventId);
      });
      const recalculate = room.recalculate.bind(room);
      let cleared = false;
      const recalculateSpy = vi.spyOn(room, 'recalculate').mockImplementation(() => {
        suppressing = true;
        try {
          recalculate();
          if (!cleared) {
            cleared = true;
            core.timeline.clearFocus(roomId);
          }
        } finally {
          suppressing = false;
        }
      });
      try {
        driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);
        expect(publishedDuringSuppression).toBe(false);
        expect(publications).toEqual([undefined]);
        expect(display.getSnapshot().value.items.map((item) => item.eventId)).toEqual([
          '$initial',
          '$late',
        ]);
        expect(live.getSnapshot().value.focusedEventId).toBeUndefined();
      } finally {
        unsubscribe();
        recalculateSpy.mockRestore();
      }
    } finally {
      await core.auth.stop();
    }
  });

  it('does not resurrect a stale pagination result on a later sync', async () => {
    const driver = createSyncDriver();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!stale-later-sync:example.org';
    try {
      const { display, live } = await setupRoom(core, driver, roomId, true);
      const displayBefore = display.getSnapshot();
      const liveBefore = live.getSnapshot();
      const gate = deferred();
      const paginate = driver.client.paginateEventTimeline.bind(driver.client);
      vi.spyOn(driver.client, 'paginateEventTimeline').mockImplementation(async (...args) => {
        await gate.promise;
        return paginate(...args);
      });
      const pending = core.timeline.paginateBackward(roomId, 10);
      await Promise.resolve();
      await core.auth.stop();
      driver.client.startClient = async () => undefined;
      await core.auth.start();
      gate.resolve();
      await pending;
      driver.client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared);
      expect(display.getSnapshot()).toBe(displayBefore);
      expect(live.getSnapshot()).toBe(liveBefore);
    } finally {
      await core.auth.stop();
    }
  });

  it('cleans event stores and lifecycle listeners on logout', async () => {
    const driver = createSyncDriver();
    const listenerCounts = () => ({
      decrypted: driver.client.listeners(MatrixEventEvent.Decrypted).length,
      replaced: driver.client.listeners(MatrixEventEvent.Replaced).length,
      redaction: driver.client.listeners(RoomEvent.Redaction).length,
      receipt: driver.client.listeners(RoomEvent.Receipt).length,
    });
    const beforeCreate = listenerCounts();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!event-store-logout:example.org';
    try {
      await setupRoom(core, driver, roomId);
      const store = core.timeline.observeEvent(roomId, '$initial');
      await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('message'));
      const snapshotBefore = store.getSnapshot();
      expect((await core.auth.logout()).ok).toBe(true);
      expect(listenerCounts()).toEqual(beforeCreate);
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            receipts: [{ eventId: '$initial', userId: '@bob:example.org' }],
          },
        ],
      });
      expect(store.getSnapshot()).toBe(snapshotBefore);
      expect(core.timeline.observeEvent(roomId, '$initial')).not.toBe(store);
    } finally {
      await core.auth.stop();
    }
  });

  it('cleans event stores and lifecycle listeners on stop and resolves fresh stores after restart', async () => {
    const driver = createSyncDriver();
    const listenerCounts = () => ({
      decrypted: driver.client.listeners(MatrixEventEvent.Decrypted).length,
      replaced: driver.client.listeners(MatrixEventEvent.Replaced).length,
      redaction: driver.client.listeners(RoomEvent.Redaction).length,
      receipt: driver.client.listeners(RoomEvent.Receipt).length,
    });
    const beforeCreate = listenerCounts();
    const core = createMatrixJsCore(driver.client);
    const roomId = '!event-store-cleanup:example.org';
    try {
      await setupRoom(core, driver, roomId);
      const store = core.timeline.observeEvent(roomId, '$initial');
      await vi.waitFor(() => expect(store.getSnapshot().value?.kind).toBe('message'));
      expect(listenerCounts().decrypted).toBeGreaterThan(beforeCreate.decrypted);
      expect(listenerCounts().replaced).toBeGreaterThan(beforeCreate.replaced);
      const snapshotBefore = store.getSnapshot();
      await core.auth.stop();
      expect(listenerCounts()).toEqual(beforeCreate);
      await driver.applyFixture({
        rooms: [
          {
            roomId,
            membership: 'join',
            receipts: [{ eventId: '$initial', userId: '@bob:example.org' }],
          },
        ],
      });
      expect(store.getSnapshot()).toBe(snapshotBefore);
      expect(core.timeline.observeEvent(roomId, '$initial')).not.toBe(store);
      driver.client.startClient = async () => undefined;
      expect((await core.auth.start()).ok).toBe(true);
      const resumed = core.timeline.observeEvent(roomId, '$initial');
      await vi.waitFor(() =>
        expect(resumed.getSnapshot().value).toMatchObject({ readBy: ['@bob:example.org'] })
      );
    } finally {
      await core.auth.stop();
    }
  });
});
