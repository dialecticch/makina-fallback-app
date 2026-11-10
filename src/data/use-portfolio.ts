import { useMemo } from "react";

import { useChainFilter } from "@/components/chain-filter";
import { useViewer } from "@/components/viewer";
import { machineKey } from "@/config/constants";
import type { MachineView } from "@/data/machine-view";
import { useMachineViews } from "@/data/use-machines";
import { useUserSnapshots } from "@/data/user-store";
import type { ActivityItem, RedemptionRequest, UserMachineState, UserSnapshot } from "@/data/user-types";
import type { ChainYieldData } from "@/data/yield";
import { useNowSeconds } from "@/hooks/use-now";
import { type RequestStatus, requestStatus } from "@/lib/derive";
import { computeYield, type YieldResult } from "@/lib/yield";

export type Position = { view: MachineView; state: UserMachineState };
export type RequestRow = { request: RedemptionRequest; view: MachineView | undefined; status: RequestStatus };
export type ActivityRow = { item: ActivityItem; view: MachineView | undefined };

/** The viewer's positions and redemptions across every instance, joined with Machine data. */
export function usePortfolio() {
  const { address } = useViewer();
  const { chainId } = useChainFilter();
  const views = useMachineViews();
  const snapshots = useUserSnapshots();
  const now = useNowSeconds();

  return useMemo(() => {
    const byKey = new Map(views.map((v) => [v.key, v]));
    const mine: UserSnapshot[] = address
      ? snapshots.filter(
          (s) =>
            s.user.toLowerCase() === address.toLowerCase() && (chainId === "all" || s.instance.chainId === chainId),
        )
      : [];

    const positions: Position[] = [];
    const requests: RequestRow[] = [];

    for (const s of mine) {
      for (const state of Object.values(s.byMachine)) {
        if (!state.shares || state.shares === 0n) continue;
        const view = byKey.get(machineKey(s.instance.chainId, state.machine));
        if (view) positions.push({ view, state });
      }
      for (const request of s.requests) {
        const view = byKey.get(machineKey(request.chainId, request.machine));
        const status = request.claimable
          ? "claimable"
          : requestStatus({
              id: request.id,
              lastFinalizedRequestId: view?.data.redeemerInfo.lastFinalizedRequestId,
              requestTime: request.requestTime,
              finalizationDelay: view?.data.redeemerInfo.finalizationDelay,
              nowSeconds: now,
            });
        requests.push({ request, view, status });
      }
    }

    requests.sort((a, b) => (a.request.id < b.request.id ? -1 : 1));

    return {
      address,
      snapshots: mine,
      positions,
      claimable: requests.filter((r) => r.status === "claimable"),
      pending: requests.filter((r) => r.status !== "claimable"),
      now,
      views: byKey,
      loadingBalances: mine.length === 0 || mine.some((s) => !s.balancesReady),
      loadingRequests: mine.length === 0 || mine.some((s) => !s.requestsReady),
    };
  }, [address, chainId, views, snapshots, now]);
}

export type EarningsRow = { view: MachineView; result: YieldResult; holding: boolean };

/**
 * What the viewer earned on each Machine with any history (src/lib/yield.ts), by `machineKey`: the movements from
 * the activity scan against the shares and requests read from state now.
 */
export function earningsRows(
  snapshots: readonly UserSnapshot[],
  yieldData: ReadonlyMap<number, ChainYieldData>,
  views: Map<string, MachineView>,
): Map<string, EarningsRow> {
  const out = new Map<string, EarningsRow>();
  for (const s of snapshots) {
    const chain = yieldData.get(s.instance.chainId);
    if (!chain || !s.requestsReady) continue;
    for (const state of Object.values(s.byMachine)) {
      const data = chain.byMachine[state.machine.toLowerCase()];
      const key = machineKey(s.instance.chainId, state.machine);
      const view = views.get(key);
      if (!data || !view) continue;
      const heldRequests = s.requests
        .filter((r) => r.machine.toLowerCase() === state.machine.toLowerCase())
        .map((r) => ({ id: r.id, value: r.claimable ? r.claimableAssets : r.estimatedAssets }));
      const result = computeYield({
        movements: data.movements,
        claims: data.claims,
        values: chain.values,
        held: { shares: state.shares, value: state.value },
        heldRequests,
      });
      out.set(key, { view, result, holding: (state.shares ?? 0n) > 0n });
    }
  }
  return out;
}

/** Activity newest first, joined with Machine data. */
export function activityRows(items: readonly ActivityItem[], views: Map<string, MachineView>): ActivityRow[] {
  return items
    .map((item) => ({ item, view: views.get(machineKey(item.chainId, item.machine)) }))
    .sort((a, b) => {
      const ta = a.item.time ?? 0n;
      const tb = b.item.time ?? 0n;
      if (ta !== tb) return ta > tb ? -1 : 1;
      if (a.item.blockNumber !== b.item.blockNumber) return a.item.blockNumber > b.item.blockNumber ? -1 : 1;
      return b.item.logIndex - a.item.logIndex;
    });
}
