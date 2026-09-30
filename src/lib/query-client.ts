import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { deserialize, serialize } from "wagmi";

import { CACHE_BUSTER, QUERY_GC_TIME_MS } from "@/config/constants";
import { ACTIVITY_CACHE_PREFIX } from "@/data/activity";

export const QUERY_CACHE_STORAGE_KEY = "makina-fallback:query-cache";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: QUERY_GC_TIME_MS,
      // Point reads are cheap now, but a refetch on every tab switch still costs every RPC a round of requests.
      refetchOnWindowFocus: false,
      // wagmi's serializer handles bigint, which the default JSON.stringify hash does not.
      queryKeyHashFn: (queryKey) => serialize(queryKey),
    },
  },
});

/** Query keys that are never written to localStorage: anything about a specific address (privacy). */
const NOT_PERSISTED = new Set(["user", "activity", "balance", "readContracts", "readContract"]);

/**
 * Persists public chain data (Machines, their data, queue health) so a reload shows the last known state while
 * revalidating. Nothing about the viewer's address is stored here. If the stored cache fails to deserialise, the
 * restore step discards it and the app refetches.
 */
export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createSyncStoragePersister({
    key: QUERY_CACHE_STORAGE_KEY,
    storage: window.localStorage,
    serialize,
    deserialize,
  }),
  buster: CACHE_BUSTER,
  // Without this the persister drops everything after 24 h, and a returning user reloads from scratch.
  maxAge: QUERY_GC_TIME_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === "success" && !NOT_PERSISTED.has(String(query.queryKey[0])),
  },
};

/** Drops cached chain data and activity (not user settings) and reloads. */
export function clearCacheAndReload() {
  queryClient.clear();
  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (key === QUERY_CACHE_STORAGE_KEY || key.startsWith(ACTIVITY_CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } finally {
    window.location.reload();
  }
}
