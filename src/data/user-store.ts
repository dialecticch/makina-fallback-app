import type { UserSnapshot } from "@/data/user-types";
import { createSnapshotStore } from "@/lib/snapshot-store";

/** One snapshot per hub instance for the current viewer (connected wallet or view-only address). */
const store = createSnapshotStore<UserSnapshot>();

export function userKey(instanceId: string, user: string) {
  return `${instanceId}:${user.toLowerCase()}`;
}

export function publishUser(snapshot: UserSnapshot) {
  store.publish(userKey(snapshot.instance.id, snapshot.user), snapshot);
}

export function removeUser(instanceId: string, user: string) {
  store.remove(userKey(instanceId, user));
}

export function useUserSnapshots(): UserSnapshot[] {
  return store.useAll();
}

export function useUserSnapshot(key: string | undefined): UserSnapshot | undefined {
  return store.useOne(key ?? "");
}
