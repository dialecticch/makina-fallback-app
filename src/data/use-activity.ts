import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useConfig } from "wagmi";
import { getPublicClient } from "wagmi/actions";

import { getChainConfig } from "@/config/chains";
import { hasActivityCache, scanActivity } from "@/data/activity";
import { useInstanceSnapshots } from "@/data/hub-store";
import type { MachineData } from "@/data/types";
import { useUserSnapshots } from "@/data/user-store";
import type { ActivityItem } from "@/data/user-types";
import { type ChainYieldData, loadYieldData, scanShareTransfers } from "@/data/yield";
import { scanEndpoints } from "@/lib/wagmi-config";

/** Blocks newer than this are refetched on every scan instead of cached (reorg safety). */
const UNCONFIRMED_SECONDS = 15 * 60;

/**
 * The viewer's on-chain history on every chain with a hub, loaded only when asked for (it is the one log scan left,
 * and on free public RPCs it can take a minute or two per chain), with what the earnings figure needs: the share
 * transfers and their values (yield.ts). Once loaded for an address, later visits load it automatically: only the
 * blocks since the last scan are fetched. It is fetched again whenever the viewer's balances or requests change,
 * so the history always accounts for the balances shown.
 */
export function useActivity(user: Address | undefined) {
  const config = useConfig();
  const hubs = useInstanceSnapshots();
  const snapshots = useUserSnapshots();
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

  // What the history must account for, per chain: share balances and request NFTs.
  const holdings = useMemo(() => {
    const out = new Map<number, string>();
    for (const s of snapshots) {
      if (s.user.toLowerCase() !== userKey || !s.balancesReady) continue;
      const parts = Object.values(s.byMachine).map((m) => `${m.machine}:${m.shares ?? ""}:${m.requestNfts ?? ""}`);
      out.set(s.instance.chainId, [out.get(s.instance.chainId) ?? "", ...parts].sort().join(","));
    }
    return out;
  }, [snapshots, userKey]);

  // Once any network's history was loaded for this address, load every network's (a new hub then catches up).
  const auto = user !== undefined && chains.some((c) => hasActivityCache(c.chainId, user));

  const results = useQueries({
    queries: chains.map((c) => ({
      queryKey: [
        "activity",
        c.chainId,
        userKey,
        c.machines.map((m) => m.machine.toLowerCase()).sort(),
        holdings.get(c.chainId) ?? "",
      ],
      queryFn: async (): Promise<{ items: ActivityItem[]; yieldData: ChainYieldData }> => {
        const blockTime = getChainConfig(c.chainId)?.blockTimeSeconds ?? 2;
        const client = getPublicClient(config, { chainId: c.chainId })!;
        const confirmations = BigInt(Math.ceil(UNCONFIRMED_SECONDS / blockTime));
        const scan = {
          client,
          endpoints: scanEndpoints(c.chainId),
          chainId: c.chainId,
          user: user!,
          fromBlock: c.fromBlock,
          confirmations,
          machines: c.machines,
        };
        // One filter for the activity, two for the transfers: progress weighs them accordingly.
        const parts = [0, 0];
        const report = () => setProgress((p) => ({ ...p, [c.chainId]: (parts[0]! + 2 * parts[1]!) / 3 }));
        const [items, { transfers, head }] = await Promise.all([
          scanActivity({ ...scan, onProgress: (f) => ((parts[0] = f), report()) }),
          scanShareTransfers({ ...scan, onProgress: (f) => ((parts[1] = f), report()) }),
        ]);
        const yieldData = await loadYieldData({
          client,
          chainId: c.chainId,
          user: user!,
          fromBlock: c.fromBlock,
          safeBlock: head - confirmations,
          machines: c.machines,
          activity: items,
          transfers,
        });
        return { items, yieldData };
      },
      // Waits for the balances: starting before them would start a second scan when they arrive.
      enabled: user !== undefined && holdings.has(c.chainId) && (requestedFor === userKey || auto),
      staleTime: 5 * 60_000,
      retry: 1,
      placeholderData: keepPreviousData,
    })),
  });

  const items: ActivityItem[] = results.flatMap((r) => r.data?.items ?? []);
  const yieldData = new Map<number, ChainYieldData>();
  results.forEach((r, i) => {
    // Only figures that match the balances shown: never a previous scan's while the new one runs.
    if (r.data && !r.isPlaceholderData) yieldData.set(chains[i]!.chainId, r.data.yieldData);
  });
  const loading = results.some((r) => r.isFetching);
  const errors = results.flatMap((r, i) =>
    r.error ? [{ chainId: chains[i]!.chainId, message: r.error.message }] : [],
  );
  const started = results.some((r) => r.fetchStatus !== "idle" || r.data !== undefined || r.error);

  return {
    items,
    yieldData,
    loading,
    errors,
    started,
    progress: chains.map((c) => ({ chainId: c.chainId, fraction: progress[c.chainId] ?? 0 })),
    load: () => setRequestedFor(userKey),
  };
}
