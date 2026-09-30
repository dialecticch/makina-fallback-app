import type { InstanceSnapshot } from "@/data/types";
import { createSnapshotStore } from "@/lib/snapshot-store";

/** One snapshot per hub instance, written by that instance's scanner. */
const store = createSnapshotStore<InstanceSnapshot>();

export function publishInstance(snapshot: InstanceSnapshot) {
  store.publish(snapshot.instance.id, snapshot);
}

export function removeInstance(id: string) {
  store.remove(id);
}

export function useInstanceSnapshots(): InstanceSnapshot[] {
  return store.useAll();
}

export function useInstanceSnapshot(id: string): InstanceSnapshot | undefined {
  return store.useOne(id);
}
