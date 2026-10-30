import { describe, expect, it, vi } from 'vitest';
import { createSnapshotStore } from './snapshot';

describe('createSnapshotStore', () => {
  it('returns the same cached snapshot until a new revision is published', () => {
    const store = createSnapshotStore([1, 2]);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    expect(first.revision).toBe(0);
  });

  it('notifies subscribers with a higher revision after publish', () => {
    const store = createSnapshotStore<number[]>([]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.publish([1]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().revision).toBe(1);
    expect(store.getSnapshot().value).toEqual([1]);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createSnapshotStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.publish(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the previous snapshot object immutable after publish', () => {
    const store = createSnapshotStore({ count: 0 });
    const before = store.getSnapshot();
    store.publish({ count: 1 });
    expect(before.value).toEqual({ count: 0 });
  });
});

describe('structural sharing', () => {
  it('does not notify or bump revision when the published value is identical', () => {
    const shared = { id: 'a' };
    const store = createSnapshotStore(shared);
    const listener = vi.fn();
    store.subscribe(listener);
    store.publish(shared);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().revision).toBe(0);
  });
});
