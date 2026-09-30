import { useMemo } from "react";

import { useChainFilter } from "@/components/chain-filter";
import { useViewer } from "@/components/viewer";
import { machineKey } from "@/config/constants";
import type { MachineView } from "@/data/machine-view";
import { useMachineViews } from "@/data/use-machines";
import { useUserSnapshots } from "@/data/user-store";
import type { ActivityItem, RedemptionRequest, UserMachineState, UserSnapshot } from "@/data/user-types";
import { useNowSeconds } from "@/hooks/use-now";
import { type RequestStatus, requestStatus } from "@/lib/derive";

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
