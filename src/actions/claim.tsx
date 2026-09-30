import { useChains, useConnection } from "wagmi";

import { claimPlan, type HubAnchor } from "@/actions/plans";
import { useActionContext } from "@/actions/use-action-context";
import { useTransactionFlow } from "@/actions/use-transaction-flow";
import { ActionButton } from "@/components/action-button";
import { useViewer } from "@/components/viewer";
import { useUserSettings } from "@/config/user-settings";
import { useInstanceSnapshots } from "@/data/hub-store";
import type { RequestRow } from "@/data/use-portfolio";
import { userKey, useUserSnapshots } from "@/data/user-store";
import { preCheckFor, type PreCheckResult } from "@/lib/pre-checks";

/** Claim one finalized request (`claimAssets(id)`); rows only exist for NFTs the viewer owns. */
export function ClaimButton({ row }: { row: RequestRow }) {
  if (!row.view) return null;
  return <ClaimOne row={row as RequestRow & { view: NonNullable<RequestRow["view"]> }} />;
}

function ClaimOne({ row }: { row: RequestRow & { view: NonNullable<RequestRow["view"]> } }) {
  const ctx = useActionContext(row.view);
  return <ClaimOneForm key={ctx.resetKey} row={row} ctx={ctx} />;
}

function ClaimOneForm({
  row,
  ctx,
}: {
  row: RequestRow & { view: NonNullable<RequestRow["view"]> };
  ctx: ReturnType<typeof useActionContext>;
}) {
  const flow = useTransactionFlow({ chainId: ctx.chainId, account: ctx.account });
  const hub = ctx.hub;
  return (
    <div className="ml-auto w-36">
      <ActionButton
        size="sm"
        chainId={ctx.chainId}
        check={preCheckFor("claim", row.view, ctx)}
        blocker={hub ? undefined : "Hub details are not loaded yet."}
        state={flow.state}
        onClick={() => {
          if (!hub) return;
          void flow.run(claimPlan([{ machine: row.view.data, hub, requestId: row.request.id }]));
        }}
      >
        Claim
      </ActionButton>
    </div>
  );
}

/** "Claim all": one button per chain, sending the claims one after another. */
export function ClaimAllButton({ rows }: { rows: RequestRow[] }) {
  const byChain = new Map<number, RequestRow[]>();
  for (const r of rows) if (r.view) byChain.set(r.request.chainId, [...(byChain.get(r.request.chainId) ?? []), r]);
  if (rows.length < 2) return <span className="sr-only">Actions</span>;
  return (
    <div className="flex flex-col items-end gap-2">
      {[...byChain.entries()].map(([chainId, list]) => (
        <ClaimAllOnChain key={chainId} chainId={chainId} rows={list} showChain={byChain.size > 1} />
      ))}
    </div>
  );
}

function ClaimAllOnChain(props: { chainId: number; rows: RequestRow[]; showChain: boolean }) {
  const { address: account, chainId: walletChainId } = useConnection();
  return <ClaimAllForm key={`${props.chainId}:${account?.toLowerCase() ?? "-"}:${walletChainId ?? "-"}`} {...props} />;
}

function ClaimAllForm({ chainId, rows, showChain }: { chainId: number; rows: RequestRow[]; showChain: boolean }) {
  const { address: account, chainId: walletChainId } = useConnection();
  const { readOnly } = useViewer();
  const chains = useChains();
  const settings = useUserSettings();
  const users = useUserSnapshots();
  const hubs = useInstanceSnapshots();
  const chainName = chains.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
  const flow = useTransactionFlow({ chainId, account });

  const checked = rows.map((row) => {
    const view = row.view!;
    const snapshot = account
      ? users.find((s) => userKey(s.instance.id, s.user) === userKey(view.data.instanceId, account))
      : undefined;
    const hubSnapshot = hubs.find((h) => h.instance.id === view.data.instanceId);
    const instance = hubSnapshot?.instance;
    const hub: HubAnchor | undefined = instance && {
      hubCoreRegistry: instance.hubCoreRegistry,
      hubPeripheryRegistry: instance.hubPeripheryRegistry,
      trustedFactories: instance.source === "builtin" ? instance.knownFactories : (hubSnapshot.factories ?? []),
    };
    const check: PreCheckResult = preCheckFor("claim", view, {
      readOnly,
      account,
      walletChainId,
      chainName,
      user: snapshot?.byMachine[view.data.machine.toLowerCase()],
      nativeBalance: snapshot?.nativeBalance,
      hubUnlocked: settings.unlockedHubs.includes(view.data.instanceId),
    });
    return { row, hub, check };
  });
  const claimable = checked.filter((c) => c.check.ok && c.hub);
  const firstFailure = checked.find((c) => !c.check.ok)?.check;
  const check = claimable.length > 0 ? ({ ok: true } as const) : (firstFailure ?? ({ ok: true } as const));

  return (
    <div className="w-44">
      <ActionButton
        size="sm"
        chainId={chainId}
        check={check}
        note={
          claimable.length < rows.length && claimable.length > 0 && firstFailure && !firstFailure.ok
            ? `${rows.length - claimable.length} request(s) skipped: ${firstFailure.reason}`
            : undefined
        }
        state={flow.state}
        onClick={() =>
          void flow.run(
            claimPlan(claimable.map((c) => ({ machine: c.row.view!.data, hub: c.hub!, requestId: c.row.request.id }))),
          )
        }
      >
        Claim all{showChain ? ` on ${chainName}` : ""} ({claimable.length || rows.length})
      </ActionButton>
    </div>
  );
}
