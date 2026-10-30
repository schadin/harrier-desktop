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
      if (Object.is(value, current.value)) return;
      current = Object.freeze({ revision: current.revision + 1, value });
      listeners.forEach((listener) => listener());
    },
  };
}
