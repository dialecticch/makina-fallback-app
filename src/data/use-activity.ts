import { useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";

import { getChainConfig } from "@/config/chains";
import { hasActivityCache, scanActivity } from "@/data/activity";
import { useInstanceSnapshots } from "@/data/hub-store";
import type { MachineData } from "@/data/types";
import type { ActivityItem } from "@/data/user-types";
import { scanEndpoints } from "@/lib/wagmi-config";

/** Blocks newer than this are refetched on every scan instead of cached (reorg safety). */
const UNCONFIRMED_SECONDS = 15 * 60;

/**
 * The viewer's on-chain history on every chain with a hub, loaded only when asked for (it is the one log scan left,
 * and on free public RPCs it can take a minute or two per chain). Once loaded for an address, later visits load
 * it automatically: only the blocks since the last scan are fetched.
 */
export function useActivity(user: Address | undefined) {
  const config = useConfig();
  const hubs = useInstanceSnapshots();
  const [requestedFor, setRequestedFor] = useState<string>();
  const [progress, setProgress] = useState<Record<number, number>>({});
  const userKey = user?.toLowerCase();

  const chains = useMemo(() => {
    const byChain = new Map<number, { chainId: number; fromBlock: bigint; machines: MachineData[] }>();
    for (const h of hubs) {
      const entry = byChain.get(h.instance.chainId) ?? {
        chainId: h.instance.chainId,
        fromBlock: h.instance.startBlock,
        machines: [],
      };
      if (h.instance.startBlock < entry.fromBlock) entry.fromBlock = h.instance.startBlock;
      entry.machines.push(...Object.values(h.machineData));
      byChain.set(h.instance.chainId, entry);
    }
    return [...byChain.values()].filter((c) => c.machines.length > 0);
  }, [hubs]);

  // Once any network's history was loaded for this address, load every network's (a new hub then catches up).
  const auto = user !== undefined && chains.some((c) => hasActivityCache(c.chainId, user));

  const results = useQueries({
    queries: chains.map((c) => ({
      queryKey: ["activity", c.chainId, userKey, c.machines.map((m) => m.machine.toLowerCase()).sort()],
      queryFn: () => {
        const blockTime = getChainConfig(c.chainId)?.blockTimeSeconds ?? 2;
        return scanActivity({
          client: getPublicClient(config, { chainId: c.chainId })!,
          endpoints: scanEndpoints(c.chainId),
          chainId: c.chainId,
          user: user!,
          fromBlock: c.fromBlock,
          confirmations: BigInt(Math.ceil(UNCONFIRMED_SECONDS / blockTime)),
          machines: c.machines,
          onProgress: (f) => setProgress((p) => ({ ...p, [c.chainId]: f })),
        });
      },
      enabled: user !== undefined && (requestedFor === userKey || auto),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  const items: ActivityItem[] = results.flatMap((r) => r.data ?? []);
  const loading = results.some((r) => r.isFetching);
  const errors = results.flatMap((r, i) =>
    r.error ? [{ chainId: chains[i]!.chainId, message: r.error.message }] : [],
  );
  const started = results.some((r) => r.fetchStatus !== "idle" || r.data !== undefined || r.error);

  return {
    items,
    loading,
    errors,
    started,
    progress: chains.map((c) => ({ chainId: c.chainId, fraction: progress[c.chainId] ?? 0 })),
    load: () => setRequestedFor(userKey),
  };
}
