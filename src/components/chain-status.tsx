import { RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useChains } from "wagmi";

import { ChainIcon } from "@/components/chain-icon";
import { useChainFilter } from "@/components/chain-filter";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { useInstanceSnapshots } from "@/data/hub-store";
import type { InstanceSnapshot, InstanceWarning } from "@/data/types";
import { customRpcHosts } from "@/lib/wagmi-config";

const PHASE_LABEL: Record<InstanceSnapshot["phase"], string> = {
  machines: "Finding Machines",
  machineData: "Reading Machine data",
  health: "Checking redemption queues",
  ready: "Up to date",
};

function warningText(w: InstanceWarning, chainName: string) {
  switch (w.kind) {
    case "factoryUpgraded":
      return `The ${chainName} hub's factory changed (${w.factory}): the Machine list may be incomplete. Update the app.`;
    case "factoryHistoryUnknown":
      return `Older Machines may be missing: these RPCs keep no history. An archive RPC in Settings fixes this.`;
    case "peripheryMismatch":
      return `The periphery registry reported by this hub's Machines (${w.reported}) is not the configured one.`;
  }
}

function StatusLine({ snapshot }: { snapshot: InstanceSnapshot }) {
  const chains = useChains();
  const { instance } = snapshot;
  const chain = chains.find((c) => c.id === instance.chainId);
  const chainName = chain?.name ?? `Chain ${instance.chainId}`;
  const custom = customRpcHosts(instance.chainId);

  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-foreground flex items-center gap-1.5 font-medium">
          <ChainIcon id={instance.chainId} name={chain?.name} />
          {chainName}
        </span>
        {instance.source !== "builtin" && (
          <span className="text-warning inline-flex items-center gap-1">
            <ShieldAlert className="size-3.5" aria-hidden />
            Unverified hub
          </span>
        )}
        {snapshot.phase === "ready" ? (
          snapshot.dataUpdatedAt ? (
            <span>
              Updated <RelativeTime unixSeconds={Math.floor(snapshot.dataUpdatedAt / 1000)} />
            </span>
          ) : (
            <span>{PHASE_LABEL.ready}</span>
          )
        ) : (
          <span role="status">{PHASE_LABEL[snapshot.phase]}…</span>
        )}
        <span>{Object.keys(snapshot.machineData).length || snapshot.machines.length} Machines</span>
        {custom.length > 0 && <span title={custom.join(", ")}>via your RPC ({custom[0]})</span>}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => snapshot.refetch?.()}>
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      </div>
      {snapshot.stalledForMs !== undefined && !snapshot.error && (
        <div role="status" className="text-warning flex flex-wrap items-center gap-2 text-xs">
          <TriangleAlert className="size-3.5" aria-hidden />
          {chainName} RPCs silent for {Math.round(snapshot.stalledForMs / 1000)} s, still retrying. Your own RPC in
          Settings fixes this.
        </div>
      )}
      {snapshot.error && (
        <div role="alert" className="text-destructive flex flex-wrap items-center gap-2 text-xs">
          <TriangleAlert className="size-3.5" aria-hidden />
          {chainName}: {snapshot.error.split("\n")[0]}
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => snapshot.refetch?.()}>
            Retry
          </Button>
        </div>
      )}
      {snapshot.warnings.map((w) => (
        <div key={w.kind} role="alert" className="text-warning flex items-start gap-2 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {warningText(w, chainName)}
        </div>
      ))}
    </div>
  );
}

/** One line per hub: loading phase, "Updated N min ago" once loaded, warnings, and a Retry on errors. */
export function ChainStatus() {
  const snapshots = useInstanceSnapshots();
  const { chainId } = useChainFilter();
  const visible = snapshots.filter((s) => chainId === "all" || s.instance.chainId === chainId);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {visible.map((s) => (
        <StatusLine key={s.instance.id} snapshot={s} />
      ))}
    </div>
  );
}
