import { ClientEvent, Method, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createSyncDriver } from './driver';

describe('matrix-js-sdk sync driver', () => {
  it('materializes joined rooms with their name state', async () => {
    const driver = createSyncDriver();
    await driver.applyFixture({
      rooms: [{ roomId: '!general:example.org', membership: 'join', name: 'General' }],
    });
    const room = driver.client.getRoom('!general:example.org');
    expect(room).not.toBeNull();
    expect(room?.name).toBe('General');
    expect(room?.getMyMembership()).toBe('join');
  });

  it('forwards a state batch update after its state events', async () => {
    const driver = createSyncDriver();
    const events: string[] = [];
    driver.client.on(RoomStateEvent.Events, () => events.push('event'));
    driver.client.on(RoomStateEvent.Update, () => events.push('update'));

    await driver.applyFixture({
      rooms: [{ roomId: '!general:example.org', membership: 'join', name: 'General' }],
    });

    expect(events).toEqual(['event', 'update']);
  });

  it('emits generic state events after room recalculation', async () => {
    const driver = createSyncDriver();
    const roomId = '!name-refresh:example.org';
    await driver.applyFixture({
      rooms: [{ roomId, membership: 'join', name: 'Old name' }],
    });
    const order: string[] = [];
    driver.client.on(RoomStateEvent.Update, () => {
      order.push('update');
      queueMicrotask(() => order.push('microtask'));
    });
    driver.client.on(RoomEvent.Name, () => order.push('name'));
    driver.client.on(ClientEvent.Event, () => order.push('event'));

    await driver.applyFixture({
      rooms: [{ roomId, membership: 'join', name: 'New name' }],
    });

    expect(order).toEqual(['update', 'microtask', 'name', 'event']);
  });

  it('does not synthesize room or state refreshes for receipt-only incremental fixtures', async () => {
    const driver = createSyncDriver();
    const roomId = '!receipts:example.org';
    await driver.applyFixture({
      rooms: [
        {
          roomId,
          membership: 'join',
          name: 'Receipts',
          messages: [{ eventId: '$message', sender: '@alice:example.org', body: 'Hello' }],
        },
      ],
    });
    const onRoom = vi.fn();
    const onState = vi.fn();
    driver.client.on(ClientEvent.Room, onRoom);
    driver.client.on(RoomStateEvent.Events, onState);

    await driver.applyFixture({
      rooms: [
        {
          roomId,
          membership: 'join',
          receipts: [{ eventId: '$message', userId: '@bob:example.org' }],
        },
      ],
    });

    expect(onRoom).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
  });

  it('logs the method, path and body of profile transport calls', async () => {
    const driver = createSyncDriver();
    const path = '/profile/%40tester%3Aexample.org/displayname';
    const body = { displayname: '  Alice  ' };

    await driver.client.http.authedRequest(Method.Put, path, undefined, body);

    expect(driver.getCalls()).toContainEqual({ method: 'PUT', path, body });
  });
});
