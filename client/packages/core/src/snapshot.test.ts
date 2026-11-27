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

  it('does not bump revision for a structurally equal new value', () => {
    const store = createSnapshotStore({ a: 1, nested: { b: [2, 3] } });
    const listener = vi.fn();
    store.subscribe(listener);
    store.publish({ a: 1, nested: { b: [2, 3] } });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().revision).toBe(0);
  });

  it('reuses unchanged object and array branches', () => {
    const unchanged = { id: 'stable' };
    const previous = { left: unchanged, right: { count: 1 }, list: [unchanged] };
    const store = createSnapshotStore(previous);
    store.publish({ left: { id: 'stable' }, right: { count: 2 }, list: [{ id: 'stable' }] });
    const next = store.getSnapshot().value;
    expect(next).not.toBe(previous);
    expect(next.left).toBe(unchanged);
    expect(next.list).toBe(previous.list);
    expect(next.right).not.toBe(previous.right);
    expect(store.getSnapshot().revision).toBe(1);
  });

  it('preserves an own __proto__ JSON key without changing the object prototype', () => {
    const previous = JSON.parse('{"__proto__":{"polluted":"no"},"revision":1}') as Record<
      string,
      unknown
    >;
    const store = createSnapshotStore(previous);
    store.publish(
      JSON.parse('{"__proto__":{"polluted":"yes"},"revision":2}') as Record<string, unknown>
    );
    const next = store.getSnapshot().value;
    expect(Object.prototype.hasOwnProperty.call(next, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    const protoValue = Object.getOwnPropertyDescriptor(next, '__proto__')?.value;
    expect(protoValue).toEqual({ polluted: 'yes' });
    expect(Object.getPrototypeOf(protoValue)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
