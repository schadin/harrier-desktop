export type Unsubscribe = () => void;

export type Snapshot<T> = {
  readonly revision: number;
  readonly value: T;
};

export type SnapshotStore<T> = {
  getSnapshot(): Snapshot<T>;
  subscribe(listener: () => void): Unsubscribe;
};

export type WritableSnapshotStore<T> = SnapshotStore<T> & {
  publish(value: T): void;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const shareValue = <T>(previous: T, next: T, seen = new WeakMap<object, object>()): T => {
  if (Object.is(previous, next)) return previous;
  if (
    typeof previous !== 'object' ||
    previous === null ||
    typeof next !== 'object' ||
    next === null
  ) {
    return next;
  }
  if (Array.isArray(previous) !== Array.isArray(next)) return next;
  if (
    !Array.isArray(previous) &&
    !Array.isArray(next) &&
    (!isPlainObject(previous) || !isPlainObject(next))
  ) {
    return next;
  }

  const seenNext = seen.get(next);
  if (seenNext === previous) return previous;

  if (Array.isArray(previous) && Array.isArray(next)) {
    let changed = previous.length !== next.length;
    const shared = next.map((item, index) => {
      const value = shareValue(previous[index], item, seen);
      if (!changed && value !== previous[index]) changed = true;
      return value;
    });
    seen.set(next, shared);
    return (changed ? shared : previous) as T;
  }

  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const previousKeys = Object.keys(previousRecord);
  const nextKeys = Object.keys(nextRecord);
  let changed = previousKeys.length !== nextKeys.length;
  const shared: Record<string, unknown> = {};
  nextKeys.forEach((key) => {
    const value = shareValue(previousRecord[key], nextRecord[key], seen);
    shared[key] = value;
    if (!changed && value !== previousRecord[key]) changed = true;
  });
  seen.set(next, shared);
  return (changed ? shared : previous) as T;
};

export function createSnapshotStore<T>(initial: T): WritableSnapshotStore<T> {
  let current: Snapshot<T> = Object.freeze({ revision: 0, value: initial });
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(value) {
      const shared = shareValue(current.value, value);
      if (Object.is(shared, current.value)) return;
      current = Object.freeze({ revision: current.revision + 1, value: shared });
      listeners.forEach((listener) => listener());
    },
  };
}
