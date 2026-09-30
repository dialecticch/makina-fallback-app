import { useSyncExternalStore } from "react";
import { deepEqual } from "wagmi";

/**
 * Minimal external store of snapshots keyed by string, written by invisible scanner components and read by pages.
 * Writes that change nothing (ignoring `refetch` closures) are dropped, so scanners can publish on every render.
 */
export function createSnapshotStore<T extends { refetch?: () => void }>() {
  let snapshots: Record<string, T> = {};
  let list: T[] = [];
  const listeners = new Set<() => void>();

  const emit = () => {
    list = Object.values(snapshots);
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    publish(key: string, snapshot: T) {
      const previous = snapshots[key];
      if (previous && deepEqual({ ...previous, refetch: undefined }, { ...snapshot, refetch: undefined })) {
        if (previous.refetch !== snapshot.refetch) snapshots[key] = snapshot;
        return;
      }
      snapshots = { ...snapshots, [key]: snapshot };
      emit();
    },
    remove(key: string) {
      if (!(key in snapshots)) return;
      const { [key]: _removed, ...rest } = snapshots;
      snapshots = rest;
      emit();
    },
    useAll(): T[] {
      return useSyncExternalStore(
        subscribe,
        () => list,
        () => list,
      );
    },
    /** One snapshot: re-renders only when that snapshot changes. */
    useOne(key: string): T | undefined {
      return useSyncExternalStore(
        subscribe,
        () => snapshots[key],
        () => snapshots[key],
      );
    },
  };
}
